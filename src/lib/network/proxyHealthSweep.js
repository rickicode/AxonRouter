// Proxy pool health sweep.
//
// The auto-fetcher replaces every group's whole pool set on a five-minute cycle,
// and the Bright Data feeds behind it return roughly a quarter unusable proxies
// (isp_proxy1 / isp_shared1 / unblocker1 measured 0/24 answering, against
// datacenter_shared1 12/12 and datacenter_proxy1 10/12). Any manual cleanup is
// therefore undone within one fetch cycle, which is why the dead pools have to be
// handled continuously rather than once.
//
// This sweep probes pools and records the verdict in proxy_pools.test_status,
// which the picker then prefers (see proxyHealthRank.js). It deliberately does NOT
// deactivate anything: a probe is a point-in-time verdict, and deactivating on it
// would fight the auto-fetcher and could empty a group on a transient network
// blip. Ranking at pick time gives the same protection while keeping every pool
// recoverable — the next sweep re-tests and promotes it back.
//
// Never throws and never rejects: a sweep that fails must not take down the
// request path or the fetcher that shares the process.
import { getProxyPools, updateProxyPool } from "@/lib/db/repos/proxyPoolsRepo.js";
import { testProxyPoolEntry } from "@/lib/network/proxyTest.js";
import { recordZoneProbe } from "@/lib/network/proxyZoneHealth.js";
import { acquireLock, releaseLock, isCacheAvailable } from "@/lib/cache/client.js";

// Budget sized against the churn, not against the pool count in isolation: the
// auto-fetcher replaces roughly 2000 Bright Data pools every five minutes, so a
// small batch can never converge — at 40 per pass the ~3400-pool set would take
// over seven hours for one sweep, and half of it would be replaced before it got
// there. 200 per pass with 12 in flight covers the set in about 85 minutes, and
// dead proxies answer fast (ECONNRESET, or a connect timeout well short of the
// 8s cap), so a pass finishes in roughly 25 seconds of actual work.
const DEFAULT_BATCH = 200;
const DEFAULT_CONCURRENCY = 12;
const DEFAULT_STALE_MS = 30 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8_000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let running = false;
let timer = null;
let lastSummary = null;

// The gateway runs as a cluster (GATEWAY_WORKERS=12, GATEWAY_CLUSTER=true) and each
// worker executes this file's top level, so without a cross-process lock a dozen
// sweeps start together, probe the same pools concurrently, and read-modify-write the
// same zone tallies — losing updates and making the verdicts unreliable, which is the
// one thing this module exists to get right. The lock is what makes it a singleton.
const SWEEP_LOCK_KEY = "proxy-health-sweep";
const SWEEP_LOCK_TTL_S = 240;

/** Errors are truncated: a pool's last_error is operator-facing and a stack trace helps nobody. */
function shortError(err) {
  const raw = typeof err === "string" ? err : (err?.error || err?.message || "");
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "probe failed";
  return s.length > 180 ? `${s.slice(0, 177)}...` : s;
}

/**
 * Pools worth probing right now: never tested, or last tested before the cutoff.
 * `staleBeforeMs` is an ABSOLUTE epoch cutoff, not a duration — the comparison below
 * is against a timestamp, and mixing the two silently rejects every pool that has
 * actually aged (an old timestamp is numerically far larger than the cutoff).
 */
function needsProbe(pool, staleBeforeMs) {
  if (pool.testStatus === "unknown" || !pool.testStatus) return true;
  const at = pool.lastTestedAt ? Date.parse(pool.lastTestedAt) : NaN;
  if (!Number.isFinite(at)) return true;
  return at <= staleBeforeMs;
}

async function probeOne(pool, timeoutMs) {
  try {
    const result = await testProxyPoolEntry(pool, timeoutMs);
    const ok = result?.ok === true;
    // A proxy that answers with an HTTP error is still a working proxy — it
    // reached the target. Only a transport failure means the egress is dead, and
    // that is the distinction that matters here: the probe target is not a health
    // endpoint, so a 4xx/5xx proves the tunnel works.
    return {
      ok,
      status: ok ? "active" : "failed",
      error: ok ? null : shortError(result?.error || `probe status ${result?.status ?? "unknown"}`),
    };
  } catch (e) {
    return { ok: false, status: "failed", error: shortError(e) };
  }
}

/**
 * Run one sweep pass.
 *
 * @param {object} [opts]
 * @param {number} [opts.batch] max pools to probe this pass (keeps a sweep from
 *   monopolising the process when a group was just re-imported with 1000 new pools)
 * @param {number} [opts.concurrency]
 * @param {number} [opts.staleMs] re-probe a known pool after this long
 * @param {number} [opts.timeoutMs] per-probe timeout
 * @param {boolean} [opts.dryRun] compute the verdicts without writing them
 * @returns {Promise<object>} summary; never rejects
 */
export async function sweepProxyPoolHealth(opts = {}) {
  const {
    batch = DEFAULT_BATCH,
    concurrency = DEFAULT_CONCURRENCY,
    staleMs = DEFAULT_STALE_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    dryRun = false,
  } = opts || {};

  const summary = { scanned: 0, active: 0, failed: 0, written: 0, skipped: false, error: null, zonesBadened: new Set() };
  if (running) {
    summary.skipped = true;
    return summary;
  }

  // Cluster-wide singleton. Without a shared cache there is no lock to take, so fall
  // through to the in-process guard rather than refusing to sweep at all.
  let lockToken = null;
  let locked = false;
  if (isCacheAvailable()) {
    lockToken = await acquireLock(SWEEP_LOCK_KEY, SWEEP_LOCK_TTL_S).catch(() => null);
    if (!lockToken) {
      summary.skipped = true;
      summary.reason = "another process is sweeping";
      return summary;
    }
    locked = true;
  }

  running = true;
  try {
    const now = Date.now();
    const staleBefore = now - Math.max(1000, Number(staleMs) || DEFAULT_STALE_MS);
    const pools = await getProxyPools({ isActive: true });
    if (!Array.isArray(pools)) {
      summary.error = "getProxyPools returned no array";
      return summary;
    }

    const queue = pools.filter((p) => p?.proxyUrl && needsProbe(p, staleBefore));
    // Interleave so a single pass does not only ever look at the head of the list
    // in the same order every time: stride through the queue instead of slicing it.
    const stride = Math.max(1, Math.floor(queue.length / Math.max(1, batch)) || 1);
    const selected = [];
    for (let i = 0; i < queue.length && selected.length < batch; i += stride) {
      selected.push(queue[i]);
    }
    summary.scanned = selected.length;
    if (selected.length === 0) return summary;

    const limit = Math.max(1, Number(concurrency) || DEFAULT_CONCURRENCY);
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const index = cursor++;
        if (index >= selected.length) return;
        const pool = selected[index];
        const verdict = await probeOne(pool, timeoutMs);
        if (verdict.ok) summary.active++;
        else summary.failed++;
        // Feed the zone-level tally as well. Pool-level status is written below,
        // but it cannot converge on its own here: the fetcher replaces more pools
        // every five minutes than a sweep can probe, so a zone condemned by an
        // overwhelming sample has to be able to take its whole population with it.
        // The zone verdict is what the picker consults, and it survives re-import
        // because it is keyed by the zone in the URL.
        try {
          const z = await recordZoneProbe(pool.proxyUrl, verdict.ok);
          if (z?.newlyBad) summary.zonesBadened.add(z.zone);
        } catch {
          /* zone health is advisory; never let it fail a sweep */
        }
        if (dryRun) continue;
        try {
          await updateProxyPool(pool.id, {
            testStatus: verdict.status,
            lastTestedAt: new Date().toISOString(),
            ...(verdict.error ? { lastError: verdict.error } : {}),
          });
          summary.written++;
        } catch (e) {
          summary.error = shortError(e);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, selected.length) }, worker));

    return summary;
  } catch (e) {
    summary.error = shortError(e);
    return summary;
  } finally {
    running = false;
    lastSummary = summary;
    if (locked && lockToken) {
      await releaseLock(SWEEP_LOCK_KEY, lockToken).catch(() => {});
    }
  }
}

/** Last sweep's counters, for an API surface. Never throws. */
export function getLastProxySweepSummary() {
  return lastSummary;
}

/**
 * Start the periodic sweep. Idempotent, and unref'd so it never holds the process
 * open on shutdown.
 */
export function startProxyHealthSweep(opts = {}) {
  if (timer) return;
  const intervalMs = Math.max(60_000, Number(opts.intervalMs) || SWEEP_INTERVAL_MS);
  const run = async () => {
    const summary = await sweepProxyPoolHealth(opts);
    const parts = [];
    if (summary.scanned) parts.push(`scanned ${summary.scanned}`);
    if (summary.active) parts.push(`${summary.active} active`);
    if (summary.failed) parts.push(`${summary.failed} failed`);
    if (summary.written) parts.push(`${summary.written} written`);
    if (summary.skipped) parts.push(`skipped${summary.reason ? ` (${summary.reason})` : ""}`);
    if (summary.zonesBadened?.size) parts.push(`newly condemned: ${[...summary.zonesBadened].join(",")}`);
    if (parts.length) {
      console.log(`[ProxyHealthSweep] ${parts.join(", ")}${summary.error ? ` — ${summary.error}` : ""}`);
    }
  };
  // First pass shortly after boot so the picker has health data without waiting a
  // full interval, but not immediately: boot is already busy and the fetcher may
  // still be replacing the pool set.
  const initialDelay = Math.max(30_000, Number(opts.initialDelayMs) || 90_000);
  const kickoff = setTimeout(() => { run(); }, initialDelay);
  kickoff.unref?.();
  timer = setInterval(run, intervalMs);
  timer.unref?.();
}

export function stopProxyHealthSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Re-exported for callers that only want the vocabulary. The runtime verdict for a
// pool comes from the sweep writing test_status; the per-zone verdicts that make the
// ranking converge live in proxyZoneHealth.js.
export { classifyProxyHealth } from "@/lib/network/proxyHealthRank.js";

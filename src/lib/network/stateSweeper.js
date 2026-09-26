// Periodic in-memory state sweeper — a cron-like job that prunes expired data
// so here long-running servers never accumulate stale entries:
//   • pool fitness marks (proxyPoolFitness.pruneExpired)
//   • pool egress geo cache incl. ipHistory (poolGeo.pruneStaleGeo)
//   • freebuff session cache + cooldowns (freebuff.pruneSessionState)
// Fail-open everywhere; never blocks startup or requests.

import { pruneExpired } from "open-sse/services/proxyPoolFitness.js";
import { pruneStaleGeo } from "open-sse/services/poolGeo.js";
import { isNonServerRuntime } from "@/sse/services/backgroundTokenRefresh.js";
import { pruneAnalyticsEvents } from "@/lib/db/repos/analyticsRepo.js";

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

let started = false;
let handle = null;

async function sweep() {
  try {
    const fitness = pruneExpired();
    const geo = pruneStaleGeo();
    const { pruneSessionState } = await import("open-sse/executors/freebuff.js");
    const sessions = pruneSessionState();
    if (fitness || geo || sessions) {
      console.log(`[StateSweeper] pruned ${fitness} fitness, ${geo} geo, ${sessions} session/cooldown entries`);
    }
    // Periodic database telemetry pruning (fail-open)
    pruneAnalyticsEvents().catch(() => {});
    import("@/lib/benchmark/runner.js")
      .then((mod) => mod.pruneBenchmarkHistory())
      .catch(() => {});
    import("@/lib/localDb")
      .then((mod) => mod.autoRecoverExpiredExhaustedConnections?.())
      .catch(() => {});
    import("@/lib/network/proxyAutoRecovery.js")
      .then((mod) => mod.autoRecoverUnhealthyProxyPools?.())
      .catch(() => {});
    import("@/lib/db/repos/usageRepo.js")
      .then((mod) => mod.pruneUsageHistory())
      .catch(() => {});
    import("@/lib/db/driver.js")
      .then(async ({ getAdapter }) => {
        const db = await getAdapter();
        const { pruneStalePartitions } = await import("@/lib/db/schema.pg.js");
        const { getSettings } = await import("@/lib/db/repos/settingsRepo.js");
        const settings = await getSettings().catch(() => ({}));
        const retainMonths = Number(settings.usagePartitionRetainMonths) || 2;
        await pruneStalePartitions(db, retainMonths);
      })
      .catch(() => {});
  } catch {
    // fail-open: next tick retries
  }
}

export function startStateSweeper({ intervalMs } = {}) {
  if (started) return false;
  if (isNonServerRuntime()) return false;
  started = true;
  const period = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : SWEEP_INTERVAL_MS;
  handle = setInterval(() => { sweep().catch(() => {}); }, period);
  if (handle.unref) handle.unref();
  return true;
}

export function stopStateSweeper() {
  if (handle) clearInterval(handle);
  handle = null;
  started = false;
}

export const __test__ = { sweep };
/**
 * Antigravity live quota cache — in-memory, refreshed on demand.
 * Used by auth.js pre-filter to skip accounts with exhausted model quota.
 * Also triggered by 409/429 error handler to sync exact resetAt from upstream.
 */

import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { getAntigravityUsage } from "open-sse/services/usage/google.js";
import { upsertUsageSnapshot } from "@/lib/db/repos/usageSnapshotsRepo.js";
import { publishEvent, setModelCooldown, clearModelCooldown, setAccountCooldown } from "@/lib/cache/client.js";
import { isRefreshBlockedMarker } from "open-sse/services/accountFallback.js";
import * as localDb from "@/lib/localDb";
import * as log from "../utils/logger.js";

function getLocalDbFn(name) {
  try {
    const fn = localDb[name];
    return typeof fn === "function" ? fn : null;
  } catch {
    return null;
  }
}

// In-memory cache: connectionId → { [modelId]: { remainingPercentage, resetAt } }
const quotaCache = new Map();
// Track last refresh per connection to avoid hammering
const lastRefreshAt = new Map();
// In-flight refresh promises — dedup concurrent 409/429 bursts
const inflightRefresh = new Map();

const MIN_REFRESH_INTERVAL_MS = 30_000; // 30s between refreshes per connection

// Strike-based circuit breaker (#3681): Google's quota API can report remaining
// quota while generation endpoints keep returning 429 (sprint/weekly dual-pool
// mismatch). After STRIKE_THRESHOLD 429s within the window for the same
// connection+model, treat the optimistic quota reading as untrusted and
// cache-block that pair instead of retry-storming upstream.
const STRIKE_WINDOW_MS = 60_000; // strikes older than this reset the count
const STRIKE_THRESHOLD = 3;
const STRIKE_BLOCK_MS = 15 * 60_000;
const strikeCounts = new Map(); // "connectionId|model" → { count, windowStart (anchored at first strike) }
const strikeBlocks = new Map(); // "connectionId|model" → blockedUntil ms

/**
 * Re-apply active strike blocks onto a fresh quotas snapshot so the auth
 * pre-filter (which reads this cache) keeps skipping the blocked pair across
 * requests until the block expires — same channel as the exhausted-0% path.
 */
function applyActiveStrikeBlocks(connectionId, quotas) {
  const now = Date.now();
  for (const [key, until] of strikeBlocks) {
    if (!key.startsWith(`${connectionId}|`)) continue;
    if (until <= now) {
      strikeBlocks.delete(key);
      continue;
    }
    quotas[key.slice(connectionId.length + 1)] = {
      remainingPercentage: 0,
      resetAt: new Date(until).toISOString(),
    };
  }
  return quotas;
}

/**
 * Clear strike state for a connection|model after a successful request, so
 * "consecutive" strikes means consecutive. Only removes a synthesized cache
 * entry (resetAt == our block deadline); a real upstream 0% reading stays.
 */
export function clearAntigravityStrikes(connectionId, model) {
  const key = `${connectionId}|${model}`;
  strikeCounts.delete(key);
  const until = strikeBlocks.get(key);
  // Always clear speed-layer cache: the pair just proved itself healthy.
  clearModelCooldown(connectionId, model).catch(() => {});
  if (until === undefined) return;
  strikeBlocks.delete(key);
  const cached = quotaCache.get(connectionId);
  if (cached?.[model]?.resetAt === new Date(until).toISOString()) {
    delete cached[model];
    quotaCache.set(connectionId, cached);
  }
}

/**
 * Get the quota cache (read-only reference for auth.js pre-filter).
 */
export function getAntigravityQuotaCache() {
  return quotaCache;
}

export function hydrateAntigravityQuotaCache(connectionId, quotas) {
  if (!connectionId || !quotas || typeof quotas !== "object") return;
  quotaCache.set(connectionId, applyActiveStrikeBlocks(connectionId, { ...quotas }));
}

/**
 * Account is exhausted only when the Gemini family AND the Claude family are
 * both empty with a future reset. GPT shares the Claude weekly pool.
 * A single family at 0% is a model lock, not an account verdict.
 */
function familyStillServing(entries, matches, now) {
  const matched = entries.filter(([key]) => matches(key));
  if (matched.length === 0) return null;
  return matched.some(([, quota]) =>
    quota.remainingPercentage > 0
    || (quota.resetAt && new Date(quota.resetAt).getTime() <= now)
  );
}

export function isAntigravityQuotaMapExhausted(quotas) {
  if (!quotas || typeof quotas !== "object") return false;
  const entries = Object.entries(quotas).filter(([, quota]) =>
    quota && typeof quota.remainingPercentage === "number"
  );
  if (entries.length === 0) return false;
  const now = Date.now();
  const gemini = familyStillServing(entries, (key) => !key.startsWith("claude") && !key.startsWith("gpt-"), now);
  const claude = familyStillServing(
    entries,
    (key) => key.startsWith("claude") || key.startsWith("gpt-"),
    now,
  );
  if (gemini === null || claude === null) return false;
  return gemini === false && claude === false;
}

export function isAntigravityAccountQuotaExhausted(connectionId) {
  return isAntigravityQuotaMapExhausted(quotaCache.get(connectionId));
}

/**
 * Refresh quota for a single antigravity connection from upstream API.
 * Updates in-memory cache only. Cache expiry is the upstream model resetAt.
 * @returns {object|null} quotas map or null on failure
 */
export async function refreshAntigravityQuota(connectionId, accessToken, providerSpecificData, opts = {}) {
  const now = Date.now();
  // Coalesce concurrent refreshes before applying the interval gate.
  const inflight = inflightRefresh.get(connectionId);
  if (inflight) return inflight;

  // Error-path callers pass { force: true } to bypass the 30s gate: a 429/409
  // is proof the cached reading is stale, and a throttled refresh returns the
  // same optimistic cache that just failed — causing phantom strike blocks
  // and a stale snapshot that the exhaustion guard in markAccountUnavailable
  // then rejects. Forced refreshes still dedup inflight bursts above and
  // still record lastRefreshAt below, so concurrent 429 storms share one
  // upstream call instead of hammering the quota API.
  const force = opts?.force === true;
  const lastRefresh = lastRefreshAt.get(connectionId) || 0;
  if (!force && now - lastRefresh < MIN_REFRESH_INTERVAL_MS) {
    log.debug("AG_QUOTA", `${connectionId.slice(0, 8)} | skip refresh (${Math.round((now - lastRefresh) / 1000)}s ago)`);
    return quotaCache.get(connectionId) || null;
  }

  // Record every attempt so failed quota calls cannot amplify an upstream 429 burst.
  lastRefreshAt.set(connectionId, now);
  const promise = _doRefresh(connectionId, accessToken, providerSpecificData, now);
  inflightRefresh.set(connectionId, promise);
  try {
    return await promise;
  } finally {
    inflightRefresh.delete(connectionId);
  }
}

/**
 * Auto-heal connection if upstream quota reports available capacity (>0%).
 * Clears exhausted testStatus, lockedAllUntil, and modelLocks for models with quota.
 * Can be called with an existing connection object or will fetch by ID.
 * @param {string} connectionId
 * @param {object} quotas - Map of model -> { remainingPercentage, resetAt }
 * @param {object|null} existingConn
 * @returns {Promise<boolean>} true if healed/updated
 */
export async function autoHealAntigravityOnQuotaRestored(connectionId, quotas, existingConn = null) {
  if (!quotas || isAntigravityQuotaMapExhausted(quotas)) return false;
  const now = Date.now();
  try {
    const getConn = getLocalDbFn("getProviderConnectionById");
    const updateConn = getLocalDbFn("updateProviderConnection");
    if (!updateConn) return false;
    const conn = existingConn || (getConn ? await getConn(connectionId).catch(() => null) : null);
    if (!conn) return false;

    const refreshBlocked = isRefreshBlockedMarker(conn?.providerSpecificData?.refreshBlocked);
    const isFatal = typeof conn?.lastError === "string"
      && /\b(account has been banned|account has been deleted|suspended|revoked|invalid_grant|invalid token|invalid api key|unauthorized|forbidden)\b/i.test(conn.lastError);
    if (conn.isActive === false || conn.testStatus === "disabled" || refreshBlocked || isFatal) {
      return false;
    }

    const hasExhaustedLock = conn.testStatus === "exhausted"
      || (conn.lockedAllUntil && new Date(conn.lockedAllUntil).getTime() > now)
      || (conn.modelLock___all && new Date(conn.modelLock___all).getTime() > now);
    const modelUpdates = {};
    const jsonLocks = { ...(conn.modelLocks || {}) };
    let modelLocksChanged = false;

    for (const [m, q] of Object.entries(quotas)) {
      if (q && q.remainingPercentage > 0) {
        if (conn[`modelLock_${m}`]) {
          modelUpdates[`modelLock_${m}`] = null;
        }
        if (jsonLocks[m]) {
          delete jsonLocks[m];
          modelLocksChanged = true;
        }
        clearModelCooldown(connectionId, m).catch(() => {});
      }
    }

    if (hasExhaustedLock || modelLocksChanged || Object.keys(modelUpdates).length > 0) {
      const updates = {
        ...modelUpdates,
        ...(hasExhaustedLock ? {
          testStatus: "active",
          lockedAllUntil: null,
          modelLock___all: null,
          rateLimitedUntil: null,
        } : {}),
        ...(modelLocksChanged ? { modelLocks: jsonLocks } : {}),
      };
      await updateConn(connectionId, updates);
      if (hasExhaustedLock) setAccountCooldown(connectionId, 0).catch(() => {});
      log.info("AG_QUOTA", `${connectionId.slice(0, 8)} | quota restored upstream — auto-cleared locks & activated connection`);
      return true;
    }
  } catch (err) {
    log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | auto-heal on quota restore failed: ${err.message}`);
  }
  return false;
}

export async function autoExhaustAntigravityOnQuotaDepleted(connectionId, quotas, existingConn = null) {
  if (!quotas || !isAntigravityQuotaMapExhausted(quotas)) return false;
  const now = Date.now();
  try {
    const getConn = getLocalDbFn("getProviderConnectionById");
    const updateConn = getLocalDbFn("updateProviderConnection");
    if (!updateConn) return false;
    const conn = existingConn || (getConn ? await getConn(connectionId).catch(() => null) : null);
    if (!conn) return false;
    if (conn.isActive === false || conn.testStatus === "disabled") return false;

    let earliestResetMs = null;
    for (const q of Object.values(quotas)) {
      if (q?.resetAt) {
        const ms = new Date(q.resetAt).getTime();
        if (Number.isFinite(ms) && ms > now && (!earliestResetMs || ms < earliestResetMs)) {
          earliestResetMs = ms;
        }
      }
    }
    const maxLockMs = now + 24 * 60 * 60 * 1000;
    const cappedResetMs = earliestResetMs ? Math.min(earliestResetMs, maxLockMs) : maxLockMs;
    const lockExpiryIso = new Date(cappedResetMs).toISOString();

    if (conn.testStatus !== "exhausted" || !conn.lockedAllUntil) {
      await updateConn(connectionId, {
        testStatus: "exhausted",
        lockedAllUntil: lockExpiryIso,
        modelLock___all: lockExpiryIso,
        lastError: "Antigravity upstream quota fully exhausted (0%)",
        errorCode: 429,
        lastErrorAt: new Date().toISOString(),
      });
      const ttlSec = Math.max(300, Math.min(Math.ceil((cappedResetMs - now) / 1000), 86400));
      setAccountCooldown(connectionId, ttlSec).catch(() => {});
      log.info("AG_QUOTA", `${connectionId.slice(0, 8)} | quota fully exhausted upstream (0%) — marked connection exhausted & locked until ${lockExpiryIso}`);
      return true;
    }
  } catch (err) {
    log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | auto-exhaust failed: ${err.message}`);
  }
  return false;
}

const IMPORTANT_GEMINI_MODELS = [
  "gemini-3.8-flash-high", "gemini-3.8-flash-medium", "gemini-3.8-flash-low",
  "gemini-3.7-flash-high", "gemini-3.7-flash-medium", "gemini-3.7-flash-low",
  "gemini-3.6-flash-high", "gemini-3.6-flash-medium", "gemini-3.6-flash-low",
  "gemini-3.5-flash-low", "gemini-3.5-flash-extra-low",
  "gemini-pro-agent", "gemini-3.1-pro-low", "gemini-2.5-pro", "gemini-2.5-flash",
];

const IMPORTANT_CLAUDE_MODELS = [
  "claude-sonnet-4-6", "claude-opus-4-6-thinking",
  "claude-3-5-sonnet", "claude-3-5-haiku", "gpt-oss-120b-medium",
];

export async function syncAntigravityConnectionStatus(connectionId, quotas, existingConn = null) {
  if (!quotas || typeof quotas !== "object") return false;

  // 1. Both families at 0% with a future reset → account exhausted.
  //    One family still serving is not an account verdict.
  if (isAntigravityQuotaMapExhausted(quotas)) {
    return await autoExhaustAntigravityOnQuotaDepleted(connectionId, quotas, existingConn);
  }

  // 2. A family still has quota, or its reset already passed. Drop a stale
  //    account-wide exhausted flag. Model locks for buckets still at 0% stay.
  await autoHealAntigravityOnQuotaRestored(connectionId, quotas, existingConn).catch(() => false);

  // 3. Sync family-level locks for 0% weekly buckets (e.g. gemini_weekly 0% locks all Gemini models)
  try {
    const updateConn = getLocalDbFn("updateProviderConnection");
    if (!updateConn) return false;
    const now = Date.now();
    const updates = {};

    const maxLockMs = now + 24 * 60 * 60 * 1000;
    const geminiWeekly = quotas.gemini_weekly;
    if (geminiWeekly && typeof geminiWeekly.remainingPercentage === "number" && geminiWeekly.remainingPercentage <= 0) {
      const resetMs = geminiWeekly.resetAt ? new Date(geminiWeekly.resetAt).getTime() : 0;
      const lockIso = (resetMs > now)
        ? new Date(Math.min(resetMs, maxLockMs)).toISOString()
        : new Date(maxLockMs).toISOString();
      updates["modelLock_gemini_weekly"] = lockIso;
      for (const m of IMPORTANT_GEMINI_MODELS) {
        updates[`modelLock_${m}`] = lockIso;
      }
    }

    const claudeWeekly = quotas.claude_gpt_weekly;
    if (claudeWeekly && typeof claudeWeekly.remainingPercentage === "number" && claudeWeekly.remainingPercentage <= 0) {
      const resetMs = claudeWeekly.resetAt ? new Date(claudeWeekly.resetAt).getTime() : 0;
      const lockIso = (resetMs > now)
        ? new Date(Math.min(resetMs, maxLockMs)).toISOString()
        : new Date(maxLockMs).toISOString();
      updates["modelLock_claude_gpt_weekly"] = lockIso;
      for (const m of IMPORTANT_CLAUDE_MODELS) {
        updates[`modelLock_${m}`] = lockIso;
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateConn(connectionId, updates);
    }
  } catch {}

  return true;
}

async function _doRefresh(connectionId, accessToken, providerSpecificData, now) {
  try {
    const proxyCfg = await resolveConnectionProxyConfig(providerSpecificData || {});
    const proxyOptions = {
      connectionProxyEnabled: proxyCfg.connectionProxyEnabled === true,
      connectionProxyUrl: proxyCfg.connectionProxyUrl || "",
      connectionNoProxy: proxyCfg.connectionNoProxy || "",
      vercelRelayUrl: proxyCfg.vercelRelayUrl || "",
      strictProxy: proxyCfg.strictProxy === true,
    };

    const usage = await getAntigravityUsage(accessToken, providerSpecificData, proxyOptions);
    // 401/403 usage responses can contain an empty quotas object plus message.
    // Preserve known cache instead of replacing it with an upstream error response.
    if (!usage?.quotas || usage.message) return null;

    // Update in-memory cache. Caller logs CACHE_BLOCK only if requested model is exhausted.
    // Strike blocks are re-asserted after every refresh so an optimistic
    // upstream reading cannot resurrect a pair we just circuit-broke.
    const finalQuotas = applyActiveStrikeBlocks(connectionId, usage.quotas);
    quotaCache.set(connectionId, finalQuotas);

    // Write-through to PostgreSQL and emit event (Decision #10 & Phase 3)
    let minRemaining = null;
    let earliestReset = null;
    for (const q of Object.values(finalQuotas)) {
      if (typeof q?.remainingPercentage === "number") {
        if (minRemaining === null || q.remainingPercentage < minRemaining) {
          minRemaining = q.remainingPercentage;
        }
      }
      if (q?.resetAt) {
        if (!earliestReset || new Date(q.resetAt).getTime() < new Date(earliestReset).getTime()) {
          earliestReset = q.resetAt;
        }
      }
    }

    try {
      await upsertUsageSnapshot({
        connectionId,
        provider: "antigravity",
        plan: usage.plan || "free",
        quotas: finalQuotas,
        remainingPct: minRemaining,
        resetAt: earliestReset,
      });
    } catch {
      // Fail-open: RAM cache above already carries the fresh reading for the
      // in-request exhaustion guard; a failed snapshot write only means the
      // durable cross-restart signal for this cycle is lost.
    }

    publishEvent("axonrouter:events", {
      type: "quota_updated",
      connectionId,
      provider: "antigravity",
      quotas: finalQuotas,
    }).catch(() => {});

    // Status sync is best-effort. A missing DB helper must not discard the
    // fresh quota map that routing just read.
    await syncAntigravityConnectionStatus(connectionId, finalQuotas).catch((err) => {
      log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | status sync failed: ${err.message}`);
    });
    return finalQuotas;
  } catch (e) {
    log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | refresh failed: ${e.message}`);
    return null;
  }
}

/**
 * Handle Antigravity 409/429 — refresh RAM cache and return model resetAt when exhausted.
 * Called from chat handler error path.
 * @returns {number|null} resetAt timestamp ms (for resetsAtMs passthrough) or null
 */
export async function handleAntigravityQuotaError(connectionId, status, model, accessToken, providerSpecificData, opts = {}) {
  log.info("AG_QUOTA", `${connectionId.slice(0, 8)} | ${status} on ${model} — refreshing quota`);

  // Throttle applies to background revive refreshes, NOT to this error path:
  // force one fresh upstream read so the exhaustion guard downstream sees the
  // true quota instead of the stale optimistic cache that just 429'd. Callers
  // that want the gated behavior pass { force: false } explicitly.
  const force = opts?.force !== false;
  const quotaMap = await refreshAntigravityQuota(connectionId, accessToken, providerSpecificData, { force });
  const quota = quotaMap?.[model];

  // Strike breaker: count every 429 whose quota reading is either optimistic
  // (remaining > 0) or unavailable (quota API 403/error). 3 within the window
  // => the pair is unhealthy regardless of what the API claims; block 15m.
  // 409 counts too by design: Antigravity signals pool exhaustion with 409 as
  // well (see #3561 — "skip exhausted account/model quota before upstream
  // retry" was motivated by 409/429 pairs), and poisoning by transient 409s
  // requires 3 of them inside 60 seconds on the same pair.
  if (!quota || quota.remainingPercentage > 0) {
    const key = `${connectionId}|${model}`;
    const now = Date.now();
    const strike = strikeCounts.get(key);
    // Fixed window anchored at the FIRST qualifying strike: three 429s must
    // all land within 60s of that first one, not within 60s of each other.
    const windowStart = strike && now - strike.windowStart <= STRIKE_WINDOW_MS ? strike.windowStart : now;
    const count = strike && windowStart === strike.windowStart ? strike.count + 1 : 1;
    strikeCounts.set(key, { count, windowStart });
    if (count >= STRIKE_THRESHOLD) {
      strikeCounts.delete(key);
      const blockedUntil = now + STRIKE_BLOCK_MS;
      const reading = quota ? `${Math.round(quota.remainingPercentage)}%` : "unknown";
      log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | STRIKE_${status} ${model} — ${count}x 429 (quota ${reading}); CACHE_BLOCK 15m`);
      // Synthesize a 0% entry in the shared cache so the auth pre-filter skips
      // this pair on subsequent requests too, not just the current retry loop.
      // Durable model lock: the routing SQL (routingModel filter) reads ONLY
      // the model_locks JSONB column in PG — speed-layer cooldowns never
      // reach that query. Without a DB lock this pair gets re-selected after
      // the transient 30-min markAccountUnavailable lock lapses, 429s again,
      // and loops forever as `active`. 24h matches ANTIGRAVITY_MODEL_LOCK_MS
      // in auth.js. Same write on strike-block and on early strikes so the
      // first 429 already sticks; markAccountUnavailable downstream merges
      // (never overwrites) via row-level FOR UPDATE merge.
      getLocalDbFn("updateProviderConnection")?.(connectionId, {
        [`modelLock_${model}`]: new Date(blockedUntil).toISOString(),
      }).catch(() => {});
      const cached = quotaCache.get(connectionId) || {};
      cached[model] = { remainingPercentage: 0, resetAt: new Date(blockedUntil).toISOString() };
      quotaCache.set(connectionId, cached);
      strikeBlocks.set(key, blockedUntil);
      // Mirror to speed-layer cache so other selections skip this pair too.
      // TTL matches the block; fail-open.
      setModelCooldown(connectionId, model, Math.ceil(STRIKE_BLOCK_MS / 1000)).catch(() => {});
      return blockedUntil;
    }
    // Pre-threshold strike: still persist the durable 24h model lock so the
    // pair is skipped by the routing SQL even though no resetAt is returned
    // (markAccountUnavailable then applies its own transient lock on top).
    getLocalDbFn("updateProviderConnection")?.(connectionId, {
      [`modelLock_${model}`]: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    }).catch(() => {});
    return null;
  }
  // Healthy-but-exhausted reading: clear strikes and use the exact resetAt.
  strikeCounts.delete(`${connectionId}|${model}`);
  if (!quota.resetAt) return null;

  const now = Date.now();
  let resetMs = new Date(quota.resetAt).getTime();
  if (resetMs <= now) return null;
  // Cap upstream reported reset time to at most 24h (1 day) so accounts don't stay locked for 6-7d
  resetMs = Math.min(resetMs, now + 24 * 60 * 60 * 1000);

  log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | UPSTREAM_${status} ${model} — quota exhausted; CACHE_BLOCK until ${new Date(resetMs).toISOString()} (capped at 24h)`);
  return resetMs;
}

/**
 * Reset all cached quota and strike blocks for a specific connection.
 */
export function clearAntigravityConnectionCache(connectionId) {
  if (!connectionId) return;
  quotaCache.delete(connectionId);
  lastRefreshAt.delete(connectionId);
  inflightRefresh.delete(connectionId);
  for (const key of strikeCounts.keys()) {
    if (key.startsWith(`${connectionId}|`)) strikeCounts.delete(key);
  }
  for (const key of strikeBlocks.keys()) {
    if (key.startsWith(`${connectionId}|`)) strikeBlocks.delete(key);
  }
}

/**
 * Batch variant for bulk reset paths: single call, no per-id loop at caller.
 * Internal iteration only; keeps single-id export intact (additive).
 */
export function clearBatchAntigravityConnectionCache(connectionIds) {
  if (!Array.isArray(connectionIds) || connectionIds.length === 0) return 0;
  let cleared = 0;
  for (const connectionId of connectionIds) {
    if (!connectionId) continue;
    clearAntigravityConnectionCache(connectionId);
    cleared += 1;
  }
  return cleared;
}

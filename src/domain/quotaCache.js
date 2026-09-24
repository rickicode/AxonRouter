/**
 * Unified Quota Cache — Domain Layer (axonrouter-X, PostgreSQL-backed).
 * Ported from OmniRoute src/domain/quotaCache.ts, adapted:
 * - persistence via usageSnapshotsRepo.upsertUsageSnapshot + provider_connections columns
 * - no codex/spark child-pool overlay (axonrouter-X has no codexAccount pool)
 * - lazy dynamic imports to avoid circular deps on hot path
 */

const ACTIVE_TTL_MS = 5 * 60 * 1000;
const EXHAUSTED_TTL_MS = 5 * 60 * 1000;
const EXHAUSTED_REFRESH_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;
const MAX_CONCURRENT_REFRESHES = 5;

function getState() {
  if (!globalThis.__axonrouterQuotaCache) {
    globalThis.__axonrouterQuotaCache = {
      cache: new Map(),
      refreshingSet: new Set(),
      refreshTimer: null,
      tickRunning: false,
    };
  }
  return globalThis.__axonrouterQuotaCache;
}

function parseDate(value) {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function safePercentage(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return clampPercent(Math.round(n));
}

function familyAlive(entries, matches) {
  const matched = entries.filter(([, key]) => matches(key));
  if (matched.length === 0) return null;
  return matched.some(([, , q]) => Number(q.remainingPercentage) > 0
    || (q.resetAt && new Date(q.resetAt).getTime() <= Date.now()));
}

function isExhausted(quotas) {
  const entries = Object.entries(quotas || {})
    .filter(([, q]) => q && q.fractionReported !== false && Number.isFinite(Number(q.remainingPercentage)))
    .map(([key, q]) => [key, String(key).toLowerCase(), q]);
  if (entries.length === 0) return false;
  const isAntigravity = entries.some(([, key]) =>
    key.startsWith("gemini") || key.startsWith("claude") || key === "claude_gpt_weekly"
  );
  if (!isAntigravity) {
    return entries.every(([, , q]) => Number(q.remainingPercentage) <= 0);
  }
  // Independent pools. One family still serving must not exhaust the account.
  const gemini = familyAlive(entries, (key) => !key.startsWith("claude") && !key.startsWith("gpt-"));
  const claude = familyAlive(entries, (key) => key.startsWith("claude") || key.startsWith("gpt-"));
  if (gemini === null || claude === null) return false;
  return gemini === false && claude === false;
}

function advancedWindowResetAt(entry, now) {
  if (!entry.nextResetAt) return null;
  const resetMs = parseDate(entry.nextResetAt);
  if (resetMs === null) return null;
  if (resetMs <= now) return { exhausted: false };
  return null;
}

function earliestResetIso(quotas) {
  let earliest = null;
  let earliestMs = Infinity;
  for (const q of Object.values(quotas || {})) {
    if (!q.resetAt) continue;
    const ms = parseDate(q.resetAt);
    if (ms !== null && ms < earliestMs) {
      earliestMs = ms;
      earliest = q.resetAt;
    }
  }
  return earliest;
}

function normalizeQuotas(rawQuotas) {
  const result = {};
  for (const [key, q] of Object.entries(rawQuotas || {})) {
    if (!q || typeof q !== "object") continue;
    const windowSeconds =
      typeof q.windowSeconds === "number" && Number.isFinite(q.windowSeconds)
        ? q.windowSeconds
        : typeof q.window_seconds === "number" && Number.isFinite(q.window_seconds)
          ? q.window_seconds
          : null;
    result[key] = {
      remainingPercentage:
        safePercentage(q.remainingPercentage) ??
        (Number(q.total) > 0
          ? clampPercent(Math.round(((Number(q.total) - (Number(q.used) || 0)) / Number(q.total)) * 100))
          : 0),
      resetAt: q.resetAt || null,
      fractionReported: q.fractionReported === false ? false : undefined,
      ...(typeof q.displayName === "string" && q.displayName.trim()
        ? { displayName: q.displayName.trim() }
        : {}),
      ...(windowSeconds != null ? { windowSeconds } : {}),
    };
  }
  return result;
}

// ─── Antigravity family scoping (ported from OmniRoute antigravityQuotaFamily.ts) ───

function normalizeModelId(model) {
  return String(model || "").toLowerCase().trim();
}

export function getAntigravityQuotaFamily(model) {
  const normalized = normalizeModelId(model).replace(/^(antigravity|agy)\//, "");
  const slashIndex = normalized.indexOf("/");
  const bare = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
  if (bare.startsWith("gemini-") || bare.includes("/gemini-") || bare.includes("gemini")) return "gemini";
  if (
    bare.startsWith("claude-") || bare.startsWith("cloud-") ||
    bare.includes("/claude-") || bare.includes("/cloud-") || bare.includes("anthropic")
  ) return "claude";
  return "other";
}

export function selectAntigravityQuotaWindowNames(quotaNames, requestedModel) {
  if (!requestedModel) return quotaNames;
  const requestedFamily = getAntigravityQuotaFamily(requestedModel);
  const cleanRequestedModel = String(requestedModel).replace(/^(antigravity|agy)\//, "");
  const bareModel = cleanRequestedModel.includes("/")
    ? cleanRequestedModel.slice(cleanRequestedModel.lastIndexOf("/") + 1)
    : cleanRequestedModel;
  if (requestedFamily === "other") {
    return quotaNames.filter((w) => {
      const bare = String(w).replace(/^(antigravity|agy)\//, "");
      return bare === bareModel || bare === cleanRequestedModel;
    });
  }
  const familyAggregates = requestedFamily === "gemini" ? ["gemini_weekly"]
    : requestedFamily === "claude" ? ["claude_gpt_weekly"] : [];
  let exactWindows = quotaNames.filter((w) => String(w).replace(/^(antigravity|agy)\//, "") === bareModel);
  if (exactWindows.length === 0) {
    const flashMatch = bareModel.match(/^(gemini-\d+(?:\.\d+)*-flash)(?:-(?:high|medium|low))?$/);
    if (flashMatch) {
      const technical = `${flashMatch[1]}-tiered`;
      exactWindows = quotaNames.filter((w) => String(w).replace(/^(antigravity|agy)\//, "") === technical);
    }
  }
  const aggregateWindows = familyAggregates.filter((k) => quotaNames.includes(k));
  const scoped = [...exactWindows, ...aggregateWindows];
  if (scoped.length > 0) return scoped;
  return quotaNames.filter((w) => getAntigravityQuotaFamily(w) === requestedFamily);
}

function isAntigravityQuotaExhausted(entry, requestedModel) {
  if (!requestedModel) return entry.exhausted;
  const quotaNames = Object.keys(entry.quotas || {});
  if (quotaNames.length === 0) return entry.exhausted;
  const scoped = selectAntigravityQuotaWindowNames(quotaNames, String(requestedModel).toLowerCase());
  if (scoped.length === 0) return entry.exhausted;
  return scoped.every((w) => {
    const q = entry.quotas[w];
    if (!q || q.fractionReported === false) return false;
    if (Number(q.remainingPercentage) > 0) return false;
    if (q.resetAt && new Date(q.resetAt).getTime() <= new Date().getTime()) return false;
    return true;
  });
}

function isStandardQuotaExhausted(entry, now) {
  if (!entry.exhausted) return false;
  const age = now - entry.fetchedAt;
  if (!entry.nextResetAt && age > EXHAUSTED_TTL_MS) return false;
  return true;
}

export function isQuotaExhaustedForRequest(connectionId, provider, requestedModel = null) {
  const entry = getState().cache.get(connectionId);
  if (!entry) return false;
  const now = Date.now();
  const advanced = advancedWindowResetAt(entry, now);
  if (advanced) {
    entry.exhausted = false;
    return false;
  }
  if (provider === "antigravity" || provider === "agy") {
    return isAntigravityQuotaExhausted(entry, requestedModel);
  }
  return isStandardQuotaExhausted(entry, now);
}

export function getQuotaCache(connectionId) {
  return getState().cache.get(connectionId) || null;
}

export function __clearForTests() {
  getState().cache.clear();
  getState().refreshingSet.clear();
}

function persistAsync(connectionId, provider, quotas, exhausted, nextResetAt, extra = {}) {
  (async () => {
    try {
      const { upsertUsageSnapshot } = await import("@/lib/db/repos/usageSnapshotsRepo.js");
      let minPct = null;
      for (const q of Object.values(quotas || {})) {
        if (q.fractionReported === false) continue;
        const p = Number(q.remainingPercentage);
        if (Number.isFinite(p) && (minPct === null || p < minPct)) minPct = p;
      }
      const snapPatch = { connectionId, provider, quotas, remainingPct: minPct, resetAt: nextResetAt };
      if (extra.plan !== undefined) snapPatch.plan = extra.plan;
      if (extra.rateLimits !== undefined) snapPatch.rateLimits = extra.rateLimits;
      await upsertUsageSnapshot(snapPatch).catch((e) => console.warn("[quotaCache] snapshot write failed:", e?.message));
    } catch (e) { console.warn("[quotaCache] snapshot write failed:", e?.message); }
    try {
      const db = await import("@/lib/localDb").catch(() => null);
      const getProviderConnectionById = db?.getProviderConnectionById;
      const updateProviderConnection = db?.updateProviderConnection;
      if (typeof getProviderConnectionById !== "function" || typeof updateProviderConnection !== "function") return;
      const conn = await getProviderConnectionById(connectionId).catch(() => null);
      if (!conn) return;
      const patch = {};
      if (exhausted) {
        // Per-model durable locks so routing SQL (model_locks JSONB) skips
        // exhausted pairs even before the next snapshot hydration.
        for (const [w, q] of Object.entries(quotas || {})) {
          if (q && Number(q.remainingPercentage) <= 0 && q.fractionReported !== false) {
            const lockIso = (q.resetAt && new Date(q.resetAt).getTime() > Date.now())
              ? q.resetAt : (nextResetAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString());
            patch[`modelLock_${w}`] = lockIso;
          }
        }
      }
      if (exhausted && conn.testStatus !== "exhausted") {
        patch.testStatus = "exhausted";
        if (nextResetAt) patch.lockedAllUntil = nextResetAt;
      } else if (!exhausted && (conn.testStatus === "exhausted" || conn.testStatus === "unavailable")) {
        const lockLive = (conn.lockedAllUntil && new Date(conn.lockedAllUntil).getTime() > Date.now())
          || (conn.rateLimitedUntil && new Date(conn.rateLimitedUntil).getTime() > Date.now());
        if (!lockLive) {
          patch.testStatus = "active";
          patch.lockedAllUntil = null;
          patch.rateLimitedUntil = null;
          // Clear per-model locks for models that recovered upstream.
          for (const [w, q] of Object.entries(quotas || {})) {
            if (q && Number(q.remainingPercentage) > 0 && (conn[`modelLock_${w}`] || conn.modelLocks?.[w])) {
              patch[`modelLock_${w}`] = null;
            }
          }
          const jsonLocks = { ...(conn.modelLocks || {}) };
          let changed = false;
          for (const [w, q] of Object.entries(quotas || {})) {
            if (q && Number(q.remainingPercentage) > 0 && jsonLocks[w]) { delete jsonLocks[w]; changed = true; }
          }
          if (changed) patch.modelLocks = jsonLocks;
        }
      }
      if (Object.keys(patch).length > 0) {
        await updateProviderConnection(connectionId, patch).catch((e) => console.warn("[quotaCache] status write failed:", e?.message));
      }
    } catch (e) { console.warn("[quotaCache] status write failed:", e?.message); }
    try {
      const { publishEvent } = await import("@/lib/cache/client.js");
      await publishEvent("axonrouter:events", { type: "quota_updated", connectionId, provider, quotas }).catch((e) => console.warn("[quotaCache] event failed:", e?.message));
    } catch {}
  })();
}

export function setQuotaCache(connectionId, provider, rawQuotas, extra = {}) {
  // Callers use two shapes:
  //   setQuotaCache(id, provider, quotas, extra)
  //   setQuotaCache(id, quotas, { provider, ...extra })
  if (provider && typeof provider === "object" && rawQuotas && typeof rawQuotas === "object" && !Array.isArray(rawQuotas)) {
    extra = rawQuotas;
    rawQuotas = provider;
    provider = extra.provider;
  }
  if (!connectionId || !provider) return null;
  const quotas = normalizeQuotas(rawQuotas);
  const exhausted = isExhausted(quotas);
  const entry = {
    connectionId, provider, quotas,
    fetchedAt: Date.now(),
    exhausted,
    nextResetAt: exhausted ? earliestResetIso(quotas) : null,
  };
  getState().cache.set(connectionId, entry);
  persistAsync(connectionId, provider, quotas, exhausted, entry.nextResetAt, extra);
  // Callers await or .catch() the result. persistAsync is fire-and-forget;
  // the returned promise resolves to the entry so both shapes work.
  return Promise.resolve(entry);
}

export function markAccountExhaustedFrom429(connectionId, provider, resetAtMs = null, model = null) {
  // Callers use two shapes:
  //   markAccountExhaustedFrom429(id, provider, resetAtMs, model)
  //   markAccountExhaustedFrom429({ connectionId, provider, model, resetAtMs, quotas })
  if (connectionId && typeof connectionId === "object") {
    const o = connectionId;
    model = o.model ?? model;
    resetAtMs = o.resetAtMs ?? o.resetMs ?? resetAtMs;
    provider = o.provider ?? provider;
    connectionId = o.connectionId ?? o.id ?? null;
  }
  if (!connectionId || !provider) return null;
  const state = getState();
  const now = Date.now();
  let effectiveResetAtMs = resetAtMs;
  if ((provider === "antigravity" || provider === "agy") && effectiveResetAtMs && effectiveResetAtMs > now) {
    effectiveResetAtMs = Math.min(effectiveResetAtMs, now + 24 * 60 * 60 * 1000);
  }
  const resetIso = effectiveResetAtMs && effectiveResetAtMs > now ? new Date(effectiveResetAtMs).toISOString() : null;
  // Cache is pre-hydrated by the routing window scan (hydrateQuotaCacheFromSnapshots),
  // so a snapshot merge here would only double-persist. Single-model 429 merges
  // into the existing entry; uncached connections get a bare exhausted entry.
  let entry = state.cache.get(connectionId);
  if (!entry) {
    entry = { connectionId, provider, quotas: {}, fetchedAt: now, exhausted: true, nextResetAt: resetIso };
  }
  if ((provider === "antigravity" || provider === "agy") && model) {
    const key = String(model).replace(/^(antigravity|agy)\//, "");
    entry.quotas = { ...entry.quotas, [key]: { remainingPercentage: 0, resetAt: resetIso } };
    entry.exhausted = isExhausted(entry.quotas);
    entry.nextResetAt = entry.exhausted ? (earliestResetIso(entry.quotas) || resetIso) : entry.nextResetAt;
  } else {
    entry.exhausted = true;
    entry.fetchedAt = now;
    if (resetIso) entry.nextResetAt = resetIso;
  }
  state.cache.set(connectionId, entry);
  persistAsync(connectionId, provider, entry.quotas, entry.exhausted, entry.nextResetAt);
  return entry;
}

export function markAccountExhaustedFromCredits(connectionId, provider, resetAtMs = null, model = null) {
  if (connectionId && typeof connectionId === "object") {
    const o = connectionId;
    model = o.model ?? model;
    resetAtMs = o.resetAtMs ?? o.resetMs ?? resetAtMs;
    provider = o.provider ?? provider;
    connectionId = o.connectionId ?? o.id ?? null;
  }
  return markAccountExhaustedFrom429(connectionId, provider, resetAtMs, model);
}

export function hydrateQuotaCacheFromSnapshots(snapshots) {
  if (!Array.isArray(snapshots)) return 0;
  let n = 0;
  for (const s of snapshots) {
    if (!s?.connectionId || !s?.provider) continue;
    const quotas = normalizeQuotas(s.quotas || {});
    const exhausted = isExhausted(quotas);
    getState().cache.set(s.connectionId, {
      connectionId: s.connectionId,
      provider: s.provider,
      quotas,
      fetchedAt: s.updatedAt ? new Date(s.updatedAt).getTime() || Date.now() : Date.now(),
      exhausted,
      nextResetAt: exhausted ? (s.resetAt || earliestResetIso(quotas)) : null,
    });
    n++;
  }
  return n;
}

async function tickRefresh() {
  const state = getState();
  if (state.tickRunning) return;
  state.tickRunning = true;
  try {
    const now = Date.now();
    const due = [];
    for (const entry of state.cache.values()) {
      if (state.refreshingSet.has(entry.connectionId)) continue;
      const age = now - entry.fetchedAt;
      if (!entry.exhausted && age >= ACTIVE_TTL_MS) due.push(entry);
      else if (entry.exhausted) {
        const resetMs = entry.nextResetAt ? parseDate(entry.nextResetAt) : null;
        if ((resetMs !== null && resetMs <= now) || age >= EXHAUSTED_REFRESH_MS) due.push(entry);
      }
      if (due.length >= MAX_CONCURRENT_REFRESHES) break;
    }
    await Promise.all(due.map((e) => refreshOne(e.connectionId)));
  } finally {
    state.tickRunning = false;
  }
}

async function refreshOne(connectionId) {
  const state = getState();
  if (state.refreshingSet.has(connectionId)) return;
  state.refreshingSet.add(connectionId);
  try {
    const { getProviderConnectionById } = await import("@/lib/localDb");
    const conn = await getProviderConnectionById(connectionId).catch(() => null);
    if (!conn || conn.isActive === false) {
      state.cache.delete(connectionId);
      return;
    }
    const { getUsageForProvider } = await import("open-sse/services/usage.js");
    let proxyOptions = null;
    try {
      const { resolveConnectionProxyConfig } = await import("@/lib/network/connectionProxy");
      proxyOptions = await resolveConnectionProxyConfig(conn).catch(() => null);
    } catch {}
    const usage = await getUsageForProvider(conn, { proxyOptions }).catch(() => null);
    if (usage?.quotas) setQuotaCache(connectionId, conn.provider, usage.quotas);
  } catch {} finally {
    state.refreshingSet.delete(connectionId);
  }
}

export function startBackgroundRefresh({ intervalMs = REFRESH_INTERVAL_MS } = {}) {
  const state = getState();
  if (state.refreshTimer) return false;
  state.refreshTimer = setInterval(() => { tickRefresh().catch(() => {}); }, intervalMs);
  if (state.refreshTimer.unref) state.refreshTimer.unref();
  return true;
}

export function stopBackgroundRefresh() {
  const state = getState();
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
    return true;
  }
  return false;
}

// Named exports the facade and auth hot path import. earliestResetAt returns
// an epoch ms (callers wrap it in `new Date`), not the ISO string stored on
// the entry. refreshQuota is the single-connection fetch the error path uses;
// the background tick keeps its own refreshOne.
export function getQuotaCacheEntry(connectionId) {
  return getQuotaCache(connectionId);
}

export function isQuotaMapExhausted(quotas) {
  return isExhausted(quotas);
}

export { earliestResetAtMs as earliestResetAt };
function earliestResetAtMs(quotas) {
  const iso = earliestResetIso(quotas);
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const inflightRefresh = new Map();

export async function refreshQuota(connectionId, accessToken, providerSpecificData, opts = {}) {
  if (!connectionId) return null;
  const inflight = inflightRefresh.get(connectionId);
  if (inflight) return inflight;
  const promise = (async () => {
    const entry = getQuotaCache(connectionId);
    const provider = entry?.provider || "antigravity";
    try {
      const { getUsageForProvider } = await import("open-sse/services/usage.js");
      const usage = await getUsageForProvider(
        { id: connectionId, provider, accessToken, providerSpecificData },
        null,
        { force: opts?.force === true },
      ).catch(() => null);
      if (!usage?.quotas || usage.message) return null;
      setQuotaCache(connectionId, provider, usage.quotas);
      return usage.quotas;
    } catch {
      return null;
    }
  })();
  inflightRefresh.set(connectionId, promise);
  try {
    return await promise;
  } finally {
    inflightRefresh.delete(connectionId);
  }
}

export const __internals = { isExhausted, normalizeQuotas, earliestResetIso, earliestResetAtMs, advancedWindowResetAt };

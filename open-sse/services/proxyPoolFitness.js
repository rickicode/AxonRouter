// Pool fitness registry — shared, in-memory, engine layer.
//
// Rotation strategies can opt into region/provider-aware pool selection: an
// executor that learns a pool's egress is unfit for a provider/model (e.g.
// Freebuff limited-mode IP) marks it here, and the pool picker skips it for
// that scope until the cooldown expires.
//
// Scope format: `provider::model` (e.g. "freebuff::openai/gpt-5.6-luna").
// All functions are fail-open: unknown pool/scope ⇒ fit.

// Scope format: `provider::model` (e.g. "freebuff::openai/gpt-5.6-luna").
// All functions are fail-open: unknown pool/scope ⇒ fit.
//
// State lives on globalThis so Next dev (Turbopack) never splits one Map into
// several per-bundle copies — the executor/chatCore marks and the
// /api/proxy-pools/fitness reader must share the SAME registry.

const FITNESS_STATE_KEY = "__axonrouterPoolFitness__";
const fitness = (globalThis[FITNESS_STATE_KEY] ??= new Map()); // poolId -> Map<scope, { until, reason }>
let persistTimer = null;
let hydratePromise = null;

export const POOL_UNFIT_MS = 5 * 60 * 1000;

// The gateway runs a cluster (GATEWAY_WORKERS>1) and this registry lives on
// globalThis — one map PER PROCESS. Without a broker, a pool reported unfit by
// worker 1 stays eligible in every other worker, so a known-dead egress keeps
// being picked fleet-wide until a restart re-hydrates from the settings snapshot.
// Same problem, same solution as account cooldowns: keep the local map as the hot
// path and use the Valkey channel purely as a cross-worker invalidation bus.
// Anything that cannot reach a broker (tests, CLI, broker down) stays
// process-local — the previous behaviour, not a regression.
const FITNESS_CHANNEL = "axon:events:pool-fitness";
let brokerReady = null;
let brokerUnavailable = false;

function applyMark(poolId, scope, until, reason) {
  if (!poolId || !scope) return;
  const byScope = fitness.get(poolId) || new Map();
  byScope.set(scope, { until, reason: reason || "" });
  fitness.set(poolId, byScope);
}

function publishMark(entry) {
  if (brokerUnavailable) return;
  if (!brokerReady) {
    brokerReady = (async () => {
      const mod = await import("@/lib/cache/valkeyClient.js");
      await mod.getValkey();
      mod.subscribeValkey(FITNESS_CHANNEL, (raw) => {
        try {
          const m = JSON.parse(raw);
          if (!m?.poolId || !m?.scope) return;
          if (m.clear) applyRemote(m.poolId, m.scope, true);
          else applyMark(m.poolId, m.scope, m.until, m.reason);
        } catch { /* malformed broadcast is ignored */ }
      });
      return mod;
    })().catch(() => { brokerUnavailable = true; return null; });
  }
  void brokerReady.then((mod) => mod?.publishValkey(FITNESS_CHANNEL, entry)).catch(() => {});
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      const { updateSettings } = await import("@/lib/db/repos/settingsRepo.js");
      await updateSettings({ proxyPoolFitness: poolFitnessSnapshot() });
    } catch {
      // Fitness is advisory; persistence failures must not block requests.
    }
  }, 25);
  if (persistTimer.unref) persistTimer.unref();
}

export function hydratePoolFitness(snapshot = {}) {
  for (const [poolId, byScope] of Object.entries(snapshot || {})) {
    const entries = Object.entries(byScope || {}).filter(([, entry]) => Number(entry?.until) > Date.now());
    if (entries.length) fitness.set(poolId, new Map(entries));
  }
}

export async function ensurePoolFitnessHydrated() {
  if (!hydratePromise) {
    hydratePromise = import("@/lib/db/repos/settingsRepo.js")
      .then(({ getSettings }) => getSettings())
      .then((settings) => hydratePoolFitness(settings.proxyPoolFitness || {}))
      .catch(() => {})
      .then(() => undefined);
  }
  return hydratePromise;
}

export function markPoolUnfit(poolId, scope, until = Date.now() + POOL_UNFIT_MS, reason = "") {
  if (!poolId || !scope) return;
  applyMark(poolId, scope, until, reason);
  schedulePersist();
  publishMark({ poolId, scope, until, reason });
}

// Subscriber side: honour a clear broadcast so a manual "un-mark" in the
// dashboard also takes effect on the gateway workers, not just the web process.
function applyRemote(poolId, scope, clear) {
  if (!poolId || !scope) return;
  // "*" is the clear-everything broadcast.
  if (scope === "*") {
    if (poolId === "*") fitness.clear(); else fitness.delete(poolId);
    return;
  }
  const byScope = fitness.get(poolId);
  if (!byScope) return;
  if (clear && scope.endsWith("::*")) {
    const prefix = scope.slice(0, -1);
    for (const s of [...byScope.keys()]) if (s.startsWith(prefix) || s === scope) byScope.delete(s);
  } else {
    byScope.delete(scope);
  }
  if (byScope.size === 0) fitness.delete(poolId);
}

export function clearPoolUnfit(poolId, scope) {
  // Broadcast even when this process holds no such mark. The dashboard runs in the
  // web container and the marks live in the gateway workers, so "not present here"
  // is the normal case for a manual un-mark — returning early there left the
  // workers still routing around the pool the operator just cleared.
  publishMark({ poolId, scope, clear: true });
  const byScope = fitness.get(poolId);
  if (!byScope) return;
  if (scope.endsWith("::*")) {
    const prefix = scope.slice(0, -1);
    for (const s of [...byScope.keys()]) {
      if (s.startsWith(prefix) || s === scope) byScope.delete(s);
    }
  } else {
    byScope.delete(scope);
  }
  if (byScope.size === 0) fitness.delete(poolId);
  schedulePersist();
  publishMark({ poolId, scope, clear: true });
}

// "provider::model" -> "provider::*" (null when the scope has no provider part)
function providerWildcardScope(scope) {
  const sep = String(scope || "").indexOf("::");
  if (sep < 0) return null;
  return `${scope.slice(0, sep)}::*`;
}

export function isPoolFit(poolId, scope, now = Date.now(), wildcardScope = null) {
  if (!poolId || fitness.size === 0) return true;
  const byScope = fitness.get(poolId);
  if (!byScope) return true;

  if (scope) {
    const entry = byScope.get(scope);
    if (entry) {
      if (entry.until <= now) {
        byScope.delete(scope);
        if (byScope.size === 0) fitness.delete(poolId);
      } else {
        return false;
      }
    }
  }

  const wc = wildcardScope ?? providerWildcardScope(scope);
  if (wc && wc !== scope) {
    const entry = byScope.get(wc);
    if (entry) {
      if (entry.until <= now) {
        byScope.delete(wc);
        if (byScope.size === 0) fitness.delete(poolId);
      } else {
        return false;
      }
    }
  }

  return true;
}

// Keep only pool ids that are not in cooldown for the scope.
export function fitPoolIds(poolIds, scope, now = Date.now()) {
  if (!poolIds || poolIds.length === 0) return [];
  if (fitness.size === 0) return poolIds;
  const wc = providerWildcardScope(scope);
  return poolIds.filter((id) => isPoolFit(id, scope, now, wc));
}

// Clear every mark — or only scopes belonging to one provider (`provider::*`).
export function clearAllPoolUnfit(provider = null) {
  const cleared = [];
  if (provider) {
    const prefix = `${provider}::`;
    for (const [poolId, byScope] of fitness) {
      for (const scope of [...byScope.keys()]) {
        if (scope.startsWith(prefix)) { byScope.delete(scope); cleared.push({ poolId, scope }); }
      }
      if (byScope.size === 0) fitness.delete(poolId);
    }
    schedulePersist();
    // Broadcast each cleared scope so gateway workers drop it too, not just the
    // process that served the dashboard request.
    for (const e of cleared) publishMark({ ...e, clear: true });
    return;
  }
  const all = [...fitness.keys()];
  fitness.clear();
  schedulePersist();
  // Wildcard scope: subscribers wipe every mark, whichever pool it names.
  for (const poolId of all) publishMark({ poolId, scope: "*", clear: true });
  publishMark({ poolId: "*", scope: "*", clear: true });
}

// Snapshot of live (non-expired) marks — expired entries are pruned here so
// consumers never see stale data and memory stays bounded.
// Test helper: drop all marks (module state is globalThis-backed).
export function resetPoolFitness() {
  fitness.clear();
  hydratePromise = Promise.resolve();
  schedulePersist();
}

// Sweep all expired marks. Returns how many scope entries were removed.
export function pruneExpired(now = Date.now()) {
  let removed = 0;
  for (const [poolId, byScope] of fitness) {
    for (const [scope, entry] of byScope) {
      if (entry.until <= now) {
        byScope.delete(scope);
        removed += 1;
      }
    }
    if (byScope.size === 0) fitness.delete(poolId);
  }
  if (removed) schedulePersist();
  return removed;
}

export function poolFitnessSnapshot(now = Date.now()) {
  const out = {};
  for (const [poolId, byScope] of fitness) {
    let pruned = false;
    for (const [scope, entry] of byScope) {
      if (entry.until <= now) {
        byScope.delete(scope);
        pruned = true;
      }
    }
    if (byScope.size === 0) {
      fitness.delete(poolId);
      continue;
    }
    if (pruned || byScope.size > 0) {
      out[poolId] = Object.fromEntries(byScope);
    }
  }
  return out;
}

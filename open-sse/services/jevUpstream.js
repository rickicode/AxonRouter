// Jev (System One) upstream resolver for the combo Difficulty Judge.
//
// Which upstream answers a classification and with which model + API key is
// declared by the provider registry (`jevConfig` on every provider whose
// `serviceKinds` includes "jev" — see open-sse/config/jevModels.js). This module
// only selects among those declarations:
//
//   • a requested provider id is a hard pin;
//   • otherwise a requested model id scopes the candidates to the providers that
//     declare it, and the highest-priority usable one answers (keyless first);
//   • with no request, the highest-priority usable provider answers — a keyless one
//     (no keyPool) always wins, then a key-backed one with a connection, caller key
//     or env key;
//   • keys come from that provider's connection pool (multi-key, round-robin),
//     then the caller's per-provider key, then the provider's env fallback.
//
// Fail-open by contract: a missing/unreachable database, a rejected query or a
// provider with no connections must never throw out of here — it only means "no
// pool available", so the caller falls back to settings/env credentials and, if
// there are none either, to the LLM judge path.
import { JEV_PROVIDERS, jevModelMeta, jevProviderById } from "../config/jevModels.js";
import { jevChainEntryLabel, normalizeJevChain } from "../config/jevChain.js";

const POOL_TTL_MS = 15_000;
const POOL_ERROR_TTL_MS = 15_000;

// provider -> { at, conns, error }
const poolCache = new Map();
// provider -> next index for round-robin key rotation
const rotateIdx = new Map();

// Test / DI hook: swap the connection reader (tests inject an in-memory pool).
// Passing null restores the default connectionsRepo reader.
let connectionLoader = null;
export function setJevConnectionLoader(fn) {
  connectionLoader = typeof fn === "function" ? fn : null;
  invalidateJevPools();
}

// Proxy resolver hook. open-sse stays agnostic: it never imports the proxy
// resolver itself, the application layer (src/sse) injects one. Signature:
//   (target) => Promise<proxyOptions|null>
// where proxyOptions is the exact shape proxyAwareFetch() consumes
// ({ connectionProxyEnabled, connectionProxyUrl, connectionNoProxy,
//    strictProxy, failClosedProxy, proxyPoolId }).
// Fail-open by contract: a resolver throw only means "no proxy".
let proxyResolver = null;
export function setJevProxyResolver(fn) {
  proxyResolver = typeof fn === "function" ? fn : null;
}

async function attachProxyOptions(target, options, log) {
  const resolver = typeof options.resolveProxy === "function" ? options.resolveProxy : proxyResolver;
  if (!resolver) return;
  try {
    const resolved = await resolver(target);
    if (resolved && typeof resolved === "object") target.proxyOptions = resolved;
  } catch (e) {
    log?.warn?.("PROXY", `[jev] proxy resolve failed for ${target.provider}: ${e?.message || e}`);
  }
}

/** Drop cached pools so a newly added key/connection is picked up immediately. */
export function invalidateJevPools() {
  poolCache.clear();
  rotateIdx.clear();
}

async function defaultConnectionLoader(provider) {
  const { getProviderConnections } = await import("@/lib/db/repos/connectionsRepo.js");
  return getProviderConnections({ provider, isActive: true });
}

/** Active API-key rows for a provider, cached for POOL_TTL_MS. Never throws. */
async function loadPool(provider) {
  const now = Date.now();
  const hit = poolCache.get(provider);
  if (hit) {
    const ttl = hit.error ? POOL_ERROR_TTL_MS : POOL_TTL_MS;
    if (now - hit.at < ttl) return hit.conns;
  }
  let conns = [];
  let error = null;
  try {
    const loader = connectionLoader || defaultConnectionLoader;
    const rows = await loader(provider);
    conns = (Array.isArray(rows) ? rows : [])
      .filter((c) => c && c.isActive !== false && typeof c.apiKey === "string" && c.apiKey.trim())
      .map((c) => ({ ...c, apiKey: c.apiKey.trim() }));
  } catch (e) {
    error = e;
  }
  poolCache.set(provider, { at: Date.now(), conns, error });
  return conns;
}

// Rotation: peek first (several candidates get built before one is chosen), commit
// only when the caller returns that target, so an unused candidate does not advance
// the counter.
function peekKey(provider, conns) {
  if (!conns.length) return "";
  const idx = (rotateIdx.get(provider) || 0) % conns.length;
  return conns[idx].apiKey;
}
function commitRotate(provider, length) {
  if (!length) return;
  rotateIdx.set(provider, ((rotateIdx.get(provider) || 0) + 1) % length);
}

// Caller-supplied credentials. `apiKeyFor(provider)` / `apiKeys[provider]` are the
// per-provider accessors; `apiKey` is the legacy single-provider (TypeSafe)
// setting and combo override, accepted only by key-backed providers.
function settingKey(options, provider) {
  if (!provider.keyPool) return "";
  if (typeof options.apiKeyFor === "function") {
    const scoped = options.apiKeyFor(provider.provider);
    if (typeof scoped === "string" && scoped.trim()) return scoped.trim();
  }
  const map = options.apiKeys;
  if (map && typeof map === "object") {
    const scoped = map[provider.provider];
    if (typeof scoped === "string" && scoped.trim()) return scoped.trim();
  }
  if (typeof options.apiKey === "string" && options.apiKey.trim()) return options.apiKey.trim();
  return "";
}

/**
 * Resolve the Jev upstream for one classification.
 *
 * @param {object} options
 *   model      — requested classifier model id; selects its declaring provider
 *   provider   — requested classifier provider id; HARD PIN (only this upstream is
 *                tried, so an unconfigured pin degrades to the LLM judge instead of
 *                silently switching providers)
 *   endpoint   — explicit System One endpoint (must be one a registry provider serves)
 *   apiKey     — caller-level key (legacy TypeSafe setting / combo override)
 *   apiKeyFor  — (providerId) => key, per-provider caller credential
 *   apiKeys    — { [providerId]: key } caller credentials
 *   resolveProxy — (target) => Promise<proxyOptions|null>, injected by the
 *                application layer so the classifier egress honours the
 *                operator's proxy config (see setJevProxyResolver)
 *   comboName  — log context
 * @returns {Promise<{family, provider, providerLabel, endpoint, model, apiKey,
 *   available, source, reason, keyless, proxyOptions}>}
 */
export async function resolveJevTarget(options = {}, log = null) {
  const comboName = options.comboName || "default";
  let requested = typeof options.model === "string" ? options.model.trim() : "";
  let requestedProvider = typeof options.provider === "string" ? options.provider.trim() : "";
  if (!requestedProvider && requested.includes("/")) {
    const slash = requested.indexOf("/");
    const prefix = requested.slice(0, slash);
    const matched = jevProviderById(prefix);
    if (matched) {
      requestedProvider = matched.provider;
      requested = requested.slice(slash + 1);
    }
  }
  const explicitEndpoint = typeof options.endpoint === "string" ? options.endpoint.trim() : "";
  const modelMeta = jevModelMeta(requested);

  // Candidate order. An explicit provider is a hard pin: it is the ONLY candidate, so
  // an unconfigured pin degrades to the LLM judge instead of silently switching
  // upstream behind the user's back. Without a pin, the requested model scopes the
  // candidates to the providers that actually declare it (so choosing `jev-latest`
  // never silently becomes another provider's model) — when the model is unknown to
  // the registry, every provider is a candidate, ordered by priority. An explicit
  // endpoint's provider always leads.
  const pinned = jevProviderById(requestedProvider);
  const candidates = [];
  if (pinned) {
    candidates.push(pinned);
  } else {
    const declaring = modelMeta
      ? JEV_PROVIDERS.filter((p) => p.models.some((m) => m.id === modelMeta.value))
      : [];
    const preferred = [
      explicitEndpoint ? JEV_PROVIDERS.find((p) => p.endpoint === explicitEndpoint) : null,
      ...declaring,
    ].filter(Boolean);
    const pool = declaring.length > 0 ? declaring : JEV_PROVIDERS;
    const seen = new Set();
    for (const provider of [...preferred, ...pool]) {
      if (seen.has(provider.provider)) continue;
      seen.add(provider.provider);
      candidates.push(provider);
    }
  }

  const pools = new Map();
  await Promise.all(
    candidates
      .filter((p) => p.keyPool)
      .map(async (p) => pools.set(p.provider, await loadPool(p.provider)))
  );

  const build = (provider) => {
    const pool = pools.get(provider.provider) || [];
    const poolIdx = pool.length ? (rotateIdx.get(provider.provider) || 0) % pool.length : 0;
    const poolConn = provider.keyPool && pool.length ? pool[poolIdx] : null;
    const poolKey = provider.keyPool ? peekKey(provider.provider, pool) : "";
    const setting = settingKey(options, provider);
    const envKey = provider.keyPool ? process.env[provider.keyEnv] || "" : "";
    const apiKey = poolKey || setting || envKey;

    // Keep the caller's model when this provider declares it; otherwise use the
    // provider's default so a mismatched id never 404s upstream.
    const modelEntry = provider.models.find((m) => m.id === requested)
      || provider.models.find((m) => m.default)
      || provider.models[0]
      || null;
    const model = modelEntry?.id || "";
    const needsKey = modelEntry?.requiresKey === true;

    let available = true;
    let reason = "ok";
    if (!model) {
      available = false;
      reason = `provider "${provider.provider}" declares no classifier model`;
    } else if (needsKey && !apiKey) {
      available = false;
      reason = `${model} requires a key and "${provider.provider}" has none (connection, setting or ${provider.keyEnv})`;
    }

    const source = !provider.keyPool
      ? "keyless"
      : poolKey ? "connection" : setting ? "settings" : envKey ? "env" : "none";

    return {
      family: provider.provider,
      provider: provider.provider,
      providerLabel: provider.label,
      endpoint: provider.endpoint,
      model,
      apiKey,
      available,
      source,
      reason,
      poolSize: pool.length,
      // Keyless providers have no connection and no key: their egress IP *is* the
      // identity (per-IP quota), so the caller must not silently fall back to a
      // direct call that would burn the shared server IP.
      keyless: !provider.keyPool,
      connectionId: poolConn?.connectionId || poolConn?.id || null,
      connectionName: poolConn?.name || poolConn?.connectionName || null,
      // The chat path reads proxy config out of the selected connection's
      // providerSpecificData; carrying it lets the caller resolve the same pool
      // for the classifier (resolveJevProxy in src/sse/services/jevProxy.js).
      providerSpecificData: poolConn?.providerSpecificData || null,
    };
  };

  let firstFailure = null;
  for (const provider of candidates) {
    const target = build(provider);
    if (target.available) {
      commitRotate(target.provider, target.poolSize);
      delete target.poolSize;
      await attachProxyOptions(target, options, log);
      return target;
    }
    if (!firstFailure) firstFailure = target;
  }

  const failed = firstFailure || {
    family: null,
    provider: null,
    providerLabel: null,
    endpoint: explicitEndpoint,
    model: requested,
    apiKey: "",
    available: false,
    source: "none",
    reason: "no Jev upstream available",
  };
  delete failed.poolSize;
  failed.available = false;
  log?.info?.(
    "DIFFICULTY",
    `[jev] no usable upstream (${failed.reason}) — combo "${comboName}" falls back to the LLM judge`,
    { comboName, model: requested, provider: requestedProvider || failed.provider }
  );
  return failed;
}

/**
 * Resolve an operator-configured classifier chain into the ordered list of System
 * One upstreams that can actually answer right now.
 *
 * Each entry is pinned to its own (provider, model) so the chain is a real
 * fallback ladder: entry 2 is only consulted after entry 1 failed, so it must not
 * inherit entry 1's resolution. Entries whose provider has no key / no reachable
 * connection are dropped here rather than at call time, so the classifier does not
 * pay a doomed round-trip to discover a misconfigured upstream on the hot path.
 *
 * `judge` entries are passed through as-is: they are answered by the normal chat
 * path, not by a System One endpoint, so there is nothing to resolve for them. The
 * returned `usable` list therefore only holds `jev` entries; callers interleave the
 * judge entries themselves, preserving the operator's order.
 *
 * Fail-open like resolveJevTarget: never throws, an empty/blank chain yields empty
 * lists and the caller keeps whatever behaviour it had before.
 *
 * @param {object} options
 *   chain    — raw chain array (normalized here)
 *   endpoint — legacy explicit endpoint hint, applied only to unpinned entries
 *   plus every key/proxy/log option resolveJevTarget accepts
 * @returns {Promise<{usable: Array<{entry, target}>, skipped: Array<object>}>}
 */
export async function resolveJevChainTargets(options = {}, log = null) {
  const chain = normalizeJevChain(options.chain);
  const usable = [];
  const skipped = [];
  for (const entry of chain) {
    if (entry.mode !== "jev") {
      skipped.push({ ...entry, reason: "judge-entry" });
      continue;
    }
    // An unpinned entry may still be steered by the caller's endpoint hint; a
    // pinned one must not be, or the pin would resolve to someone else.
    const target = await resolveJevTarget(
      {
        ...options,
        model: entry.model,
        provider: entry.provider,
        endpoint: entry.provider ? "" : options.endpoint || "",
      },
      log
    );
    if (target?.available) {
      usable.push({ entry, target });
    } else {
      skipped.push({ ...entry, reason: target?.reason || "unavailable" });
    }
  }
  if (skipped.length) {
    log?.info?.(
      "DIFFICULTY",
      `[jev] chain: ${usable.length} of ${chain.length} upstream(s) usable — skipped ${skipped
        .map((s) => `${jevChainEntryLabel(s)} (${s.reason})`)
        .join(", ")}`,
      { comboName: options.comboName || "default" }
    );
  }
  return { usable, skipped };
}

/**
 * Priority-ordered classifier providers that can answer right now (keyless, or
 * key available). Observability/UI helper — never throws.
 */
export async function listAvailableJevProviders() {
  const out = [];
  for (const provider of JEV_PROVIDERS) {
    const pool = provider.keyPool ? await loadPool(provider.provider) : [];
    const key = pool.length ? peekKey(provider.provider, pool) : (process.env[provider.keyEnv] || "");
    const usable = provider.models.filter((m) => !m.requiresKey || key);
    if (usable.length === 0) continue;
    out.push({
      provider: provider.provider,
      label: provider.label,
      endpoint: provider.endpoint,
      keyless: !provider.keyPool,
      keyConfigured: !!key,
      poolSize: pool.length,
      models: usable.map((m) => m.id),
    });
  }
  return out;
}
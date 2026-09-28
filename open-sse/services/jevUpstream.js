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
 *   comboName  — log context
 * @returns {Promise<{family, provider, providerLabel, endpoint, model, apiKey,
 *   available, source, reason}>}
 */
export async function resolveJevTarget(options = {}, log = null) {
  const comboName = options.comboName || "default";
  const requested = typeof options.model === "string" ? options.model.trim() : "";
  const requestedProvider = typeof options.provider === "string" ? options.provider.trim() : "";
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
    };
  };

  let firstFailure = null;
  for (const provider of candidates) {
    const target = build(provider);
    if (target.available) {
      commitRotate(target.provider, target.poolSize);
      delete target.poolSize;
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
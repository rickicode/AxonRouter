// Jev (System One) upstream resolver for the combo Difficulty Judge.
//
// Decides, per classification, which System One endpoint the judge calls and with
// which model + API key:
//
//   1. TypeSafe AI direct — https://api.typesafe.ai/v1/systemone, model "jev-latest".
//      Key comes from the "typesafe" connection pool (multi-key, round-robin) first,
//      then the caller's setting (settings.typeSafeApiKey / combo override), then
//      the TYPESAFE_API_KEY env fallback.
//   2. OpenCode Zen — https://opencode.ai/zen/v1/systemone, model "jev-1.13-free"
//      (default, free) or "jev-1.13" (pay-as-you-go). Chosen when the user has an
//      active "opencode-zen" connection or opts in with mode "free-zen"
//      (tuning.jevMode / options.mode / JEV_MODE env). Zen keys come from the
//      opencode-zen connection pool.
//
// Fail-open by contract: a missing/unreachable database, a rejected query or a
// provider with no connections must never throw out of here — it only means "no
// pool available", so the caller falls back to settings/env credentials and, if
// there are none either, to the LLM judge path.
import {
  TYPESAFE_SYSTEMONE_URL,
  ZEN_SYSTEMONE_URL,
  JEV_MODEL_TYPESAFE,
  JEV_MODEL_ZEN,
  JEV_ZEN_MODELS,
  DEFAULT_JEV_MODEL,
  jevModelFamily,
} from "../config/jevModels.js";

export const TYPESAFE_PROVIDER = "typesafe";
export const ZEN_PROVIDER = "opencode-zen";

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

/**
 * Resolve the Jev upstream for one classification.
 *
 * @param {object} options
 *   model      — requested model id (jev-latest | jev-1.13-free | jev-1.13)
 *   endpoint   — explicit endpoint (only the two known System One URLs are honoured)
 *   mode       — "free-zen" opts into the Zen upstream without a Zen connection
 *   apiKey     — setting-level TypeSafe key (settings.typeSafeApiKey / combo override)
 *   zenApiKey  — setting-level Zen key override
 *   comboName  — log context
 * @returns {Promise<{family, provider, endpoint, model, apiKey, available, source, reason}>}
 */
export async function resolveJevTarget(options = {}, log = null) {
  const comboName = options.comboName || "default";
  const requested = typeof options.model === "string" ? options.model.trim() : "";
  const mode = String(
    options.mode || options.jevMode || process.env.JEV_MODE || ""
  ).toLowerCase().trim();
  const explicitEndpoint =
    typeof options.endpoint === "string" ? options.endpoint.trim() : "";

  // Which family did the caller ask for? Model id wins, then an explicit Zen
  // endpoint / "free-zen" mode; otherwise left undecided and availability decides.
  let family = jevModelFamily(requested || null);
  if (!family && mode === "free-zen") family = "zen";
  if (!family && explicitEndpoint) {
    family = explicitEndpoint === ZEN_SYSTEMONE_URL ? "zen" : "typesafe";
  }

  // Legacy tuning.typeSafeEndpoint may point at a proxy of the TypeSafe upstream;
  // anything that is not the Zen URL stays in the TypeSafe family and is used as-is
  // (it already was before upstream resolution existed).
  const typesafeEndpoint =
    explicitEndpoint && explicitEndpoint !== ZEN_SYSTEMONE_URL && /^https?:\/\//i.test(explicitEndpoint)
      ? explicitEndpoint
      : TYPESAFE_SYSTEMONE_URL;

  const [zenPool, typesafePool] = await Promise.all([
    loadPool(ZEN_PROVIDER),
    loadPool(TYPESAFE_PROVIDER),
  ]);
  const zenOptedIn = zenPool.length > 0 || mode === "free-zen";

  const buildZen = () => {
    const model = JEV_ZEN_MODELS.includes(requested) ? requested : DEFAULT_JEV_MODEL;
    const poolKey = zenPool.length ? peekKey(ZEN_PROVIDER, zenPool) : "";
    const apiKey = poolKey || options.zenApiKey || process.env.OPENCODE_ZEN_API_KEY || "";
    let available = zenOptedIn;
    let reason = zenOptedIn ? "ok" : "no opencode-zen connection and mode is not free-zen";
    if (available && model === JEV_MODEL_ZEN && !apiKey) {
      available = false;
      reason = "jev-1.13 is pay-as-you-go and no OpenCode Zen key is available";
    }
    return {
      family: "zen",
      provider: ZEN_PROVIDER,
      endpoint: ZEN_SYSTEMONE_URL,
      model,
      apiKey,
      available,
      source: poolKey ? "connection" : apiKey ? "settings" : "none",
      reason,
      poolSize: zenPool.length,
    };
  };

  const buildTypesafe = () => {
    const poolKey = typesafePool.length ? peekKey(TYPESAFE_PROVIDER, typesafePool) : "";
    const apiKey = poolKey || options.apiKey || process.env.TYPESAFE_API_KEY || "";
    // A Zen model id can land here after a Zen miss — TypeSafe only serves jev-latest.
    const model = requested && !JEV_ZEN_MODELS.includes(requested) ? requested : JEV_MODEL_TYPESAFE;
    const available = !!apiKey;
    return {
      family: "typesafe",
      provider: TYPESAFE_PROVIDER,
      endpoint: typesafeEndpoint,
      model,
      apiKey,
      available,
      source: poolKey ? "connection" : options.apiKey ? "settings" : apiKey ? "env" : "none",
      reason: available ? "ok" : "no TypeSafe API key (connection pool, settings or TYPESAFE_API_KEY)",
      poolSize: typesafePool.length,
    };
  };

  // Preference order: an explicit family is honoured first (Zen still falls back to
  // TypeSafe when it has no upstream), otherwise the free Zen default wins when it
  // is opted in, then TypeSafe.
  const candidates =
    family === "typesafe"
      ? [buildTypesafe]
      : family === "zen"
        ? [buildZen, buildTypesafe]
        : [buildZen, buildTypesafe];

  let firstFailure = null;
  for (const build of candidates) {
    const target = build();
    if (target.available) {
      commitRotate(target.provider, target.poolSize);
      delete target.poolSize;
      return target;
    }
    if (!firstFailure) firstFailure = target;
  }

  const failed = firstFailure || {
    family: family || null,
    provider: null,
    endpoint: family === "zen" ? ZEN_SYSTEMONE_URL : TYPESAFE_SYSTEMONE_URL,
    model: requested || DEFAULT_JEV_MODEL,
    apiKey: "",
    available: false,
    source: "none",
    reason: "no Jev upstream available",
  };
  delete failed.poolSize;
  failed.available = false;
  log?.info?.(
    "DIFFICULTY",
    `[jev] no usable upstream (${failed.reason}) — combo "${comboName}" falls back to settings/env or the LLM judge`,
    { comboName, family: failed.family, zenPool: zenPool.length, typesafePool: typesafePool.length }
  );
  return failed;
}

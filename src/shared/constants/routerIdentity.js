// Canonical external-config identity for the gateway, written into third-party
// CLI tool configs (Codex config.toml, OpenCode config.json, ...).
// Strictly AxonRouter only — no legacy fallback.

export const PROVIDER_ID = "axonrouter";
export const PROVIDER_IDS = [PROVIDER_ID];

export const PROVIDER_DISPLAY_NAME = "AxonRouter";

// Placeholder key written for localhost setups (auth bypassed on loopback).
export const DEFAULT_LOCAL_API_KEY = "sk_axonrouter";

/** True when `value` is the AxonRouter provider identifier. */
export function isRouterProviderId(value) {
  return value === PROVIDER_ID;
}

/** Pick the gateway provider entry from a provider map. */
export function pickRouterProvider(map) {
  return map?.[PROVIDER_ID] || null;
}

/** Placeholder key: prefer a real key, else the AxonRouter local default. */
export function resolveLocalApiKey(apiKey) {
  return apiKey || DEFAULT_LOCAL_API_KEY;
}

/**
 * Resolve the key to persist into a CLI tool config.
 *
 * The dashboard cards send an empty string when no key is explicitly selected
 * (the default key is often a placeholder or only exists in the DB). A literal
 * placeholder would be written into the config and then rejected (401) by the
 * gateway whenever key auth is enforced, so resolve the first active dashboard
 * key instead.
 *
 * Order: the caller's non-placeholder key → first active DB key → "" (the
 * config then carries no credential and loopback stays unauthenticated).
 * The placeholder is never returned, and the resolved key is never logged.
 *
 * @param {string|null|undefined} callerKey Key sent by the frontend.
 * @returns {Promise<string>}
 */
export async function resolveCliApiKey(callerKey) {
  const trimmed = typeof callerKey === "string" ? callerKey.trim() : "";
  if (trimmed && trimmed !== DEFAULT_LOCAL_API_KEY) return trimmed;
  try {
    // Imported lazily so pure consumers of this module never pull in the DB layer.
    const { getApiKeys } = await import("@/lib/db");
    const keys = await getApiKeys();
    const active = keys.find((k) => k.isActive);
    return active?.key || "";
  } catch {
    return "";
  }
}

const MODEL_PREFIX_RE = new RegExp(`^${PROVIDER_ID}/`);

/** True when a model id is namespaced under axonrouter. */
export function isRouterModelId(id) {
  return typeof id === "string" && MODEL_PREFIX_RE.test(id);
}

/** "axonrouter/foo" -> "foo". */
export function stripRouterModelPrefix(id) {
  return typeof id === "string" ? id.replace(MODEL_PREFIX_RE, "") : id;
}

/** Build the namespaced model id for writing ("axonrouter/model"). */
export function routerModelId(model) {
  return `${PROVIDER_ID}/${model}`;
}

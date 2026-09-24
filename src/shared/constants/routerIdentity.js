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

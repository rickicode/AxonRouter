/**
 * Leaf provider-exhaustion policy constants.
 *
 * Lives in the domain layer with ZERO imports so both `@/domain/quotaCache.js`
 * and `@/sse/services/accountExhaustionPolicy.js` can consume the same set
 * without creating a circular dependency (quotaCache is imported by the policy
 * module itself).
 *
 * Semantic contract:
 * `testStatus = "exhausted"` is a TERMINAL, ACCOUNT-WIDE state — every model on
 * the account is dead because global credits / pooled quota hit zero. Providers
 * whose free models keep serving after paid credits die, or whose quota resets
 * on a timer, must NEVER carry it; their per-model failures ride a modelLock
 * instead.
 */
export const NEVER_ACCOUNT_EXHAUSTED_PROVIDERS = new Set([
  // registry category "free" (free-only pools)
  "freebuff",
  "gemini-cli",
  "opencode",
  "kiro",
  "kilocode-free",
  "ovhcloud-free",
  "llmtech-free",
  "llm7-free",

  // registry category "freeTier" — except cloudflare-ai, whose daily neuron
  // budget is pooled across every model (true account-wide exhaustion)
  "coqui",
  "searxng",
  "byteplus",
  "api-airforce",
  "edge-tts",
  "kimchi",
  "vertex",
  "nvidia",
  "tortoise",
  "kilo-gateway",
  "bazaarlink",
  "local-device",
  "gemini",
  "ollama",
  "google-tts",
  "poolside",
  "openrouter",

  // free models survive paid-credit death / model-scoped billing
  "cline",
  "cline-free",
  "kilocode",
  "opencode-zen",
  "bai",

  // timed recovery (monthly cap) -> "unavailable", never terminal
  "github",
]);

/**
 * Normalize a provider alias/id for set membership.
 *
 * Deliberately dependency-free: callers hold either a canonical id or an alias,
 * and every exempt provider currently uses the same string for both.
 *
 * @param {string|null|undefined} providerId
 * @returns {string}
 */
export function normalizeExhaustionProviderId(providerId) {
  return String(providerId || "").trim().toLowerCase();
}

/**
 * Check if a provider can ever have an account marked as "exhausted".
 *
 * @param {string|null} providerId
 * @returns {boolean}
 */
export function providerAllowsAccountExhausted(providerId) {
  const id = normalizeExhaustionProviderId(providerId);
  if (!id) return false;
  return !NEVER_ACCOUNT_EXHAUSTED_PROVIDERS.has(id);
}

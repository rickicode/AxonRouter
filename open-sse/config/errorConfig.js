// OpenAI-compatible error types mapping (client-facing)
export const ERROR_TYPES = {
  400: { type: "invalid_request_error", code: "bad_request" },
  401: { type: "authentication_error", code: "invalid_api_key" },
  402: { type: "billing_error", code: "payment_required" },
  403: { type: "permission_error", code: "insufficient_quota" },
  404: { type: "invalid_request_error", code: "model_not_found" },
  406: { type: "invalid_request_error", code: "model_not_supported" },
  429: { type: "rate_limit_error", code: "rate_limit_exceeded" },
  500: { type: "server_error", code: "internal_server_error" },
  502: { type: "server_error", code: "bad_gateway" },
  503: { type: "server_error", code: "service_unavailable" },
  504: { type: "server_error", code: "gateway_timeout" },
};

// Default error messages per status code (client-facing)
export const DEFAULT_ERROR_MESSAGES = {
  400: "Bad request",
  401: "Invalid API key provided",
  402: "Payment required",
  403: "You exceeded your current quota",
  404: "Model not found",
  406: "Model not supported",
  429: "Rate limit exceeded",
  500: "Internal server error",
  502: "Bad gateway - upstream provider error",
  503: "Service temporarily unavailable",
  504: "Gateway timeout",
};

// Exponential backoff config for rate limits
export const BACKOFF_CONFIG = {
  base: 2000,
  max: 5 * 60 * 1000,
  maxLevel: 15,
};

// Default cooldown for transient/unknown errors
export const TRANSIENT_COOLDOWN_MS = 30 * 1000;

// Hard cap for provider-reported rate limit cooldown (defaults to 7 days for long upstream reset windows)
export const MAX_RATE_LIMIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;
// Total upstream account attempts per client request, across ALL combo
// members combined. The per-model loop below is additionally capped by
// MAX_FALLBACK_ATTEMPTS, but without a shared budget a 5-member combo could
// burn 5×10 upstream calls before giving up. When the budget is exhausted the
// request stops immediately with a 503 instead of hanging the client.
export const MAX_TOTAL_ROTATION_ATTEMPTS = 5;
// Combo target timeout: one hung member must not stall the whole fallback
// chain. Exceeding it synthesizes a 504 that stays fallback-eligible WITHOUT
// penalizing the account (the provider may be fine; this attempt just ran
// out of time). The loser is aborted where the plumbing allows.
export const COMBO_TARGET_TIMEOUT_MS = 120000;
// Absolute wall-clock cap for one fallback combo pass; exceeding it returns
// 504 COMBO_TIMEOUT instead of letting member timeouts stack without bound.
export const COMBO_LOOP_SAFETY_MS = 300000;
// Combo failover: a member that fails this many times CONSECUTIVELY (across
// requests, tracked in memory cache) is deprioritized to the back of the combo so the
// next request starts at a healthy model instead of re-burning rotations on
// the dead one. A success resets the count; the window TTL auto-forgives.
export const MODEL_FAILOVER_THRESHOLD = 3;
export const MODEL_FAILOVER_WINDOW_S = 900;
// Fleet-wide dead provider/model circuit: this many CONSECUTIVE empty
// selections (no routable account found) short-circuits selection to a fast
// 503 without scanning PG or burning rotation budget. Any successful
// selection resets.
export const DEAD_CIRCUIT_THRESHOLD = 3;
export const DEAD_CIRCUIT_WINDOW_S = 60;
// Last-known-good pointer TTL: how long one proven account serves as the
// instant fast path for its provider+model.
export const LKG_TTL_S = Number.isFinite(Number(process.env.LKG_TTL_S)) ? Math.max(0, Number(process.env.LKG_TTL_S)) : 60;

// Maximum number of accounts to attempt per request before giving up (prevents hammering hundreds of accounts)
export const MAX_FALLBACK_ATTEMPTS = 10;

// Cooldown durations (ms)
const COOLDOWN = {
  permanentAuth: 3 * 24 * 60 * 60 * 1000, // 3 days for auth/permission/ineligible errors
  quotaExhausted: 24 * 60 * 60 * 1000, // 24 hours max for quota/credit exhaustion
  monthlyExhausted: 30 * 24 * 60 * 60 * 1000, // 30 days for user quota / credit exhaustion
  long: 2 * 60 * 1000,
  short: 5 * 1000,
};

/**
 * Unified error classification rules.
 * Checked top-to-bottom: text rules first (by order), then status rules.
 * Each rule: { text?, status?, cooldownMs?, backoff?, lockAll? }
 *   - text: substring match (case-insensitive) on error message
 *   - status: HTTP status code match
 *   - cooldownMs: fixed cooldown duration
 *   - backoff: true = use exponential backoff (rate limit)
 *   - lockAll: true = account-level lock (all models on this account locked)
 */
export const ERROR_RULES = [
  // Gemini / Antigravity executor upstream errors (trigger combo fallback)
  {
    text: "invalid gemini function call history",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: true,
  },
  {
    text: "functioncall appears before",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: true,
  },
  {
    text: "antigravity executor:",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: true,
  },

  // --- Text-based rules (checked first, order = priority) ---
  // Content filter / safety review errors (do NOT lock account or model)
  {
    text: "empty response content",
    cooldownMs: 60 * 1000,
    lockAll: false,
    shouldFallback: true,
  },
  // Cline free-tier per-model daily cap (e.g. "Daily free limit reached on model z-ai/glm-5.3-flash")
  // Lock ONLY the specific model, never the entire account, so other free models keep serving.
  {
    text: "daily free limit reached on model",
    cooldownMs: 24 * 60 * 60 * 1000,
    lockAll: false,
    shouldFallback: true,
  },
  // OpenRouter/KiloCode/Cline free-tier per-model daily cap (e.g. "limit_rpd", "Daily limit reached for <model>")
  {
    text: "limit_rpd",
    cooldownMs: 24 * 60 * 60 * 1000,
    lockAll: false,
    shouldFallback: true,
  },
  {
    text: "daily limit reached for",
    cooldownMs: 24 * 60 * 60 * 1000,
    lockAll: false,
    shouldFallback: true,
  },
  // Cline free-tier daily cap: quota is strictly per-model on Cline Free.
  // Lock ONLY the affected model for 24h (or until resetsAtMs), never the entire account!
  {
    text: "daily free limit",
    cooldownMs: 24 * 60 * 60 * 1000,
    lockAll: false,
    shouldFallback: true,
  },
  // Cloudflare Workers AI free-tier daily neuron quota (account-wide, 24h)
  {
    text: "daily free allocation",
    cooldownMs: 24 * 60 * 60 * 1000,
    lockAll: true,
    shouldFallback: true,
  },
  {
    text: "10,000 neurons",
    cooldownMs: 24 * 60 * 60 * 1000,
    lockAll: true,
    shouldFallback: true,
  },
  {
    text: "did not pass the safety review",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: false,
  },
  {
    text: "safety review",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: false,
  },
  {
    text: "request illegal",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: false,
  },
  {
    text: "content filter",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: false,
  },
  // Grok CLI / Grok Build free usage exhaustion (rolling 24-hour window)
  {
    text: "free-usage-exhausted",
    cooldownMs: 24 * 60 * 60 * 1000,
    lockAll: true,
    isExhausted: true,
    shouldFallback: true,
  },
  {
    text: "used all the included free usage",
    cooldownMs: 24 * 60 * 60 * 1000,
    lockAll: true,
    isExhausted: true,
    shouldFallback: true,
  },
  {
    text: "rolling 24-hour window",
    cooldownMs: 24 * 60 * 60 * 1000,
    lockAll: true,
    isExhausted: true,
    shouldFallback: true,
  },

  // Credit / Balance / User Quota exhaustion (Account-wide lock for 30 days, status: exhausted)
  {
    text: "insufficient_user_quota",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "预扣费额度失败",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "用户剩余额度",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "用户额度不足",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "user's credit limit is insufficient",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "quota is running low",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "credits exhausted",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "insufficient credits",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "insufficient balance",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "out of credits",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "quota reached",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "quota exhausted",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "insufficient_quota",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "insufficient quota",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },
  {
    text: "exceeded your current quota",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
  },

  // Morph LLM quota & rate limit rules
  {
    text: "monthly quota exceeded",
    cooldownMs: COOLDOWN.monthlyExhausted,
    lockAll: true,
    isExhausted: true,
    shouldFallback: true,
  },
  {
    text: "limit: 5 requests/minute",
    cooldownMs: 15 * 1000,
    lockAll: false,
    shouldFallback: true,
  },
  {
    text: "please slow down your requests",
    cooldownMs: 15 * 1000,
    lockAll: false,
    shouldFallback: true,
  },
  {
    text: "is not served by this endpoint",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: true,
  },
  // Model-level restrictions (do NOT lock other models on the same account)
  {
    text: "not available on the workers free plan",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "upgrade to access this model",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "plan does not include",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "not supported for your plan",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "model not supported for tier",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "not available in your region",
    cooldownMs: TRANSIENT_COOLDOWN_MS,
    lockAll: false,
  },
  // Google region refusal: rotate account temporarily, never disable/exhaust it.
  {
    text: "user location is not supported for the api use.",
    cooldownMs: TRANSIENT_COOLDOWN_MS,
    lockAll: false,
    disableAccount: false,
    isExhausted: false,
  },
  {
    text: "country_blocked",
    cooldownMs: TRANSIENT_COOLDOWN_MS,
    lockAll: false,
  },
  // OpenRouter endpoint routing: the free model's only endpoint cannot serve
  // tool-calling requests ("Filter by Tool Compatibility" / "No endpoints found
  // that support tool use"). Capability gap, not quota: the model sits out
  // briefly and the request falls back to a tool-capable member. Stripping
  // tools would break agentic clients (Cline) that NEED them.
  {
    text: "no endpoints found that support tool use",
    cooldownMs: COOLDOWN.long,
    lockAll: false,
    shouldFallback: true,
    isToolIncompatibility: true,
  },
  {
    text: "filter by tool compatibility",
    cooldownMs: COOLDOWN.long,
    lockAll: false,
    shouldFallback: true,
    isToolIncompatibility: true,
  },

  // OpenRouter & generic model gating (agentic harness gate, routing funnel, model-specific access)
  {
    text: "only available on agentic harnesses",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "agentic harness",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "gate free endpoints",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "failed_routing_step",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "routing_funnel",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "is only available",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "only available on",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "only available to",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "only accessible to",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "model is not available",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "model not available",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "endpoint is not available",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "not allowed for this model",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "model is not allowed",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  // Model-entitlement rejection (upstream e.g. runanywhere:
  // {"code":"model_not_entitled","message":"This request is not permitted for
  // this API key."}). The key is valid but cannot use THIS model — lock the
  // model only. Without these, the message falls through to the status-403
  // rule below and parks the whole account for 3 days, even though every
  // other model on the same key keeps working.
  {
    text: "not permitted for this api key",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
    shouldFallback: true,
  },
  {
    text: "model_not_entitled",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
    shouldFallback: true,
  },
  {
    text: "model is restricted",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "requires a paid",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  {
    text: "requires a subscription",
    cooldownMs: COOLDOWN.quotaExhausted,
    lockAll: false,
  },
  // Freebuff proxy-egress refusal (NOT an account fault): the proxy IP is
  // anonymous/blocked, so the pool must rotate — never lock the account.
  // Must stay ABOVE the "session request failed: 403" and status-403 rules.
  {
    text: "free_mode_unavailable",
    cooldownMs: TRANSIENT_COOLDOWN_MS,
    lockAll: false,
  },
  {
    text: "anonymous_network",
    cooldownMs: TRANSIENT_COOLDOWN_MS,
    lockAll: false,
  },
  { text: "rotating proxy", cooldownMs: TRANSIENT_COOLDOWN_MS, lockAll: false },

  // Connect timeout errors: transient 15s cooldown, never lock account or disable
  {
    text: "fetch connect timeout",
    cooldownMs: 15 * 1000,
    lockAll: false,
    disableAccount: false,
  },
  {
    text: "connect timeout",
    cooldownMs: 15 * 1000,
    lockAll: false,
    disableAccount: false,
  },
  {
    text: "connection timeout",
    cooldownMs: 15 * 1000,
    lockAll: false,
    disableAccount: false,
  },

  {
    text: "invalid authentication credential",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  { text: "invalid_grant", cooldownMs: 0, lockAll: true, disableAccount: true },
  {
    text: "invalid_api_key",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  {
    text: "invalid api key",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  {
    text: "unauthenticated",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  {
    text: "unrecoverable_refresh_error",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  {
    text: "refresh_token_reused",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  {
    text: "account has been banned",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  {
    text: "account has been deleted",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  {
    text: "account suspended",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  {
    text: "user has been suspended",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  { text: "banned", cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "suspended", cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "token revoked", cooldownMs: 0, lockAll: true, disableAccount: true },
  { text: "unauthorized", cooldownMs: 0, lockAll: true, disableAccount: true },
  {
    text: "validation_required",
    cooldownMs: 0,
    lockAll: true,
    disableAccount: true,
  },
  { text: "not eligible", cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  {
    text: "session request failed: 403",
    cooldownMs: COOLDOWN.permanentAuth,
    lockAll: true,
  },
  {
    text: "permission_denied",
    cooldownMs: COOLDOWN.permanentAuth,
    lockAll: true,
  },
  {
    text: "permission denied",
    cooldownMs: COOLDOWN.permanentAuth,
    lockAll: true,
  },
  { text: "no credentials", cooldownMs: COOLDOWN.long },
  { text: "request not allowed", cooldownMs: COOLDOWN.short },
  { text: "improperly formed request", cooldownMs: COOLDOWN.long },
  // OpenCode free-tier gate (all free models): per-egress/session rejection,
  // NOT per-account. The next request from a different IP/session will succeed.
  // Must stay ABOVE the status-403 rule to prevent permanent auth lock.
  {
    text: "free tier can only be used from within",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: true,
  },
  // Freebuff limited tier rate limit on proxy IP: transient cooldown (30s), do NOT lock account
  {
    text: '"accesstier":"limited"',
    cooldownMs: TRANSIENT_COOLDOWN_MS,
    lockAll: false,
  },
  {
    text: 'accesstier: "limited"',
    cooldownMs: TRANSIENT_COOLDOWN_MS,
    lockAll: false,
  },
  {
    text: '"pool":"freebucks"',
    cooldownMs: TRANSIENT_COOLDOWN_MS,
    lockAll: false,
  },
  {
    text: "limited tier rate limited on this proxy",
    cooldownMs: TRANSIENT_COOLDOWN_MS,
    lockAll: false,
  },
  // Upstream per-minute RPM cap (e.g. Atria "User rate limit reached on requests
  // per min for model"): the window resets in <=60s. A precise 65s model-scoped
  // cooldown beats the generic exponential backoff (2s -> 5min cap), which
  // over-locks single-account providers after a burst. Must sit ABOVE the
  // generic "rate limit" backoff rules.
  { text: "requests per min", cooldownMs: 65 * 1000, lockAll: false, shouldFallback: true },
  { text: "rate limit", backoff: true },
  { text: "too many requests", backoff: true },
  { text: "quota exceeded", backoff: true },
  { text: "quota_exhausted", backoff: true },
  { text: "resource_exhausted", backoff: true },
  // MODEL_CAPACITY_EXHAUSTED (antigravity 503): no upstream reset time exists,
  // lock just the affected model long enough to stop retry-storming (15m),
  // account stays usable for other models.
  {
    text: "model_capacity_exhausted",
    cooldownMs: 15 * 60 * 1000,
    lockAll: false,
  },
  {
    text: "no capacity available for model",
    cooldownMs: 15 * 60 * 1000,
    lockAll: false,
  },
  { text: "capacity", backoff: true },
  { text: "overloaded", backoff: true },

  // --- Status-based rules (fallback when text doesn not match) ---
  // 4xx request errors (400/404/413) are request-level, not account-level:
  // the account itself is healthy; only the request was bad. Do NOT lock.
  { status: 400, cooldownMs: 0, lockAll: false, shouldFallback: false },
  { status: 404, cooldownMs: 0, lockAll: false, shouldFallback: false },
  { status: 413, cooldownMs: 0, lockAll: false, shouldFallback: false },
  // Auth errors — the account/token is dead or forbidden
  { status: 401, cooldownMs: 0, lockAll: true, disableAccount: true },
  { status: 402, cooldownMs: COOLDOWN.long },
  { status: 403, cooldownMs: COOLDOWN.permanentAuth, lockAll: true },
  // HTTP 524 / Gateway Timeout (upstream timeout / server down)
  // Fallback to next account/provider, but NEVER lock account, NEVER disable, no cooldown
  {
    status: 524,
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: true,
    disableAccount: false,
  },
  {
    text: "524 a timeout occurred",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: true,
    disableAccount: false,
  },
  {
    text: "error 524",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: true,
    disableAccount: false,
  },
  {
    text: "gateway timeout",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: true,
    disableAccount: false,
  },
  {
    text: "a timeout occurred",
    cooldownMs: 0,
    lockAll: false,
    shouldFallback: true,
    disableAccount: false,
  },

  // Rate limit — backoff
  { status: 429, backoff: true },
];

// Backward compat: COOLDOWN_MS object (used by index.js re-export)
export const COOLDOWN_MS = {
  unauthorized: COOLDOWN.long,
  paymentRequired: COOLDOWN.long,
  notFound: COOLDOWN.long,
  transient: TRANSIENT_COOLDOWN_MS,
  requestNotAllowed: COOLDOWN.short,
};

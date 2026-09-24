// WorkBuddy (workbuddy.ai) — Tencent "Buddy AI" office agent, same gateway family
// as CodeBuddy Intl but a separate brand/product and a different host. Sits behind
// the same unified OpenAI-compatible /v2/chat/completions gateway as CodeBuddy
// (verified 2026-09-13: /v2/plugin/auth/state returns a valid device-code state +
// authUrl, /v2/chat/completions and /v2/billing/meter/get-user-resource return 401
// without a token). Auth is device-code like CodeBuddy Intl, but WorkBuddy's own
// login page uses Google/GitHub OAuth — the plugin/IDE device-code page at
// /login?platform=ide&state=... does the upstream exchange.
export default {
  id: "workbuddy",
  alias: "wb",
  uiAlias: "wb",
  hidden: false,
  priority: 90,
  display: {
    name: "WorkBuddy",
    icon: "smart_toy",
    color: "#006EFF",
    website: "https://www.workbuddy.ai",
    notice: {
      signupUrl: "https://workbuddy.ai/invite?code=FUACYYR4",
    },
  },
  category: "oauth",
  authModes: ["oauth", "apikey"],
  hasOAuth: true,
  transport: {
    // Chat gateway is OpenAI-compatible SSE — same /v2/chat/completions path as
    // CodeBuddy Intl/CN. Stream-only: non-stream requests are rejected (11101).
    baseUrl: "https://www.workbuddy.ai/v2/chat/completions",
    forceStream: true,
    // WorkBuddy speaks the same unified OpenAI reasoning_effort shape as CodeBuddy.
    thinkingFormat: "openai",
    headers: {
      "User-Agent": "IDE/2.108.1 WorkBuddy/2.108.1",
      "X-Product": "SaaS",
      "X-IDE-Type": "IDE",
      "X-IDE-Name": "IDE",
      "X-Domain": "www.workbuddy.ai",
      "x-requested-with": "XMLHttpRequest",
      "x-codebuddy-request": "1",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
    // Billing endpoint mirrors CodeBuddy shape (data.Response.Data.Accounts[]);
    // see services/usage/codebuddy-cn.js — we reuse that handler for workbuddy.
    usage: {
      url: "https://www.workbuddy.ai/v2/billing/meter/get-user-resource",
    },
  },
  // WorkBuddy shares CodeBuddy's model backbone (proxied GLM/Kimi/MiniMax/
  // Catalog is hand-verified against the live WorkBuddy gateway (2026-09-13):
  // every id below returned SSE content when probed with a valid token. Models
  // that returned 11102 ("service info not found") were removed. passthroughModels
  // still lets clients send any id the gateway actually answers, but this list is
  // the curated, known-good set surfaced in the UI / combo picker.
  models: [
    { id: "hy3", name: "Hy3" },
    { id: "deepseek-v4.1-flash", name: "DeepSeek-V4.1-Flash" },
    { id: "hy4-preview", name: "Hy4 Preview" },
    { id: "glm-5.3", name: "GLM-5.3" },
    { id: "glm-5.2", name: "GLM-5.2" },
    { id: "glm-5.1", name: "GLM-5.1" },
    { id: "glm-5v-turbo", name: "GLM-5v-Turbo" },
    { id: "minimax-m3", name: "MiniMax-M3" },
    { id: "kimi-k3", name: "Kimi-K3" },
    { id: "kimi-k2.7", name: "Kimi-K2.7-Code" },
    { id: "kimi-k2.6", name: "Kimi-K2.6" },
    { id: "kimi-k2.5", name: "Kimi-K2.5" },
    // ── OpenAI GPT family (verified) ──
    { id: "gpt-5.6-luna", name: "GPT-5.6-Luna" },
    { id: "gpt-5.5", name: "GPT-5.5" },
    { id: "gpt-5.4", name: "GPT-5.4" },
    // ── Anthropic Claude family (verified) ──
    { id: "claude-opus-5", name: "Claude Opus 5" },
    { id: "claude-opus-4.6", name: "Claude Opus 4.6" },
    { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  ],
  passthroughModels: true,
  oauth: {
    baseUrl: "https://www.workbuddy.ai",
    stateUrl: "https://www.workbuddy.ai/v2/plugin/auth/state",
    tokenUrl: "https://www.workbuddy.ai/v2/plugin/auth/token",
    refreshUrl: "https://www.workbuddy.ai/v2/plugin/auth/token/refresh",
    userAgent: "IDE/2.63.2 WorkBuddy/2.63.2",
    platform: "ide",
    pollInterval: 5000,
  },
  features: {
    usage: true,
    usageApikey: true,
  },
};

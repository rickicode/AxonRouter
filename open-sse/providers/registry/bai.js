// B.ai (api.b.ai) — OpenAI-compatible chat gateway aggregator.
// Verified 2026-09-14 via live probe with a funded-by-default key: only the
// free-tier models below return HTTP 200. Everything else is either
// "credit insufficient balance" (paid-per-request) or 403 "Deposit required
// to unlock premium models".
//
// Before this entry, B.ai was used via a user-created custom node
// (openai-compatible-chat-bai, prefix "bai"). Connections were migrated to
// provider "bai" so combo entries like "bai/hy3" keep working.
export default {
  id: "bai",
  alias: "bai",
  uiAlias: "bai",
  hidden: false,
  priority: 250,
  display: {
    name: "B.ai",
    icon: "smart_toy",
    color: "#7C3AED",
    textIcon: "BAI",
    website: "https://b.ai",
    notice: {
      text: "Free tier: hy3, mimo-v2.5, qwen3.8-flash work with no credits. All other models require a funded B.ai balance.",
      apiKeyUrl: "https://b.ai",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.b.ai/v1/chat/completions",
    validateUrl: "https://api.b.ai/v1/models",
    forceStream: true,
  },
  // Live-verified (HTTP 200) on a zero-balance key — free tier.
  models: [
    { id: "hy3", name: "Hy3" },
    { id: "mimo-v2.5", name: "Mimo V2.5" },
    { id: "qwen3.8-flash", name: "Qwen3.8 Flash" },
    // ── Paid — kept visible but require a funded balance ──
    { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
    { id: "glm-5.1", name: "GLM 5.1" },
    { id: "glm-5.2", name: "GLM 5.2" },
    { id: "glm-5.3", name: "GLM 5.3" },
    { id: "glm-5.3-flash", name: "GLM 5.3 Flash" },
    { id: "minimax-m2.7", name: "MiniMax M2.7" },
    { id: "minimax-m3", name: "MiniMax M3" },
    { id: "mimo-v2.5-pro", name: "Mimo V2.5 Pro" },
    { id: "hy4-preview", name: "Hy4 Preview" },
    { id: "kimi-k2.6", name: "Kimi K2.6" },
    { id: "kimi-k3", name: "Kimi K3" },
    { id: "qwen3.8-27b", name: "Qwen3.8 27B" },
    { id: "qwen3.8-max", name: "Qwen3.8 Max" },
    { id: "gpt-5-mini", name: "GPT-5 Mini" },
    { id: "gpt-5-nano", name: "GPT-5 Nano" },
    { id: "gpt-5.2", name: "GPT-5.2" },
    { id: "gpt-5.4", name: "GPT-5.4" },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini" },
    { id: "gpt-5.4-nano", name: "GPT-5.4 Nano" },
    { id: "gpt-5.4-pro", name: "GPT-5.4 Pro" },
    { id: "gpt-5.5", name: "GPT-5.5" },
    { id: "gpt-5.5-instant", name: "GPT-5.5 Instant" },
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
    { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
    { id: "gpt-6-astra", name: "GPT-6 Astra" },
    { id: "claude-fable-5", name: "Claude Fable 5" },
    { id: "claude-fable-5.1", name: "Claude Fable 5.1" },
    { id: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
    { id: "claude-opus-4.5", name: "Claude Opus 4.5" },
    { id: "claude-opus-4.6", name: "Claude Opus 4.6" },
    { id: "claude-opus-4.7", name: "Claude Opus 4.7" },
    { id: "claude-opus-4.8", name: "Claude Opus 4.8" },
    { id: "claude-opus-5", name: "Claude Opus 5" },
    { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
    { id: "gemini-3-flash", name: "Gemini 3 Flash" },
    { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
  ],
  passthroughModels: true,
};

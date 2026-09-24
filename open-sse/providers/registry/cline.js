const cline = {
  id: "cline",
  priority: 80,
  alias: "cl",
  uiAlias: "cl",
  display: {
    name: "Cline",
    icon: "smart_toy",
    color: "#5B9BD5",
    textIcon: "CL",
    website: "https://cline.bot",
    notice: {
      signupUrl: "https://cline.bot",
    },
  },
  category: "oauth",
  authModes: ["oauth"],
  hasOAuth: true,
    transport: {
      baseUrl: "https://api.cline.bot/api/v1/chat/completions",
      forceStream: true,
      headers: {
        "HTTP-Referer": "https://cline.bot",
        "X-Title": "Cline",
      },
      // Non-stream chat completions come back wrapped in {"success":true,"data":{...}}
      quirks: { clineEnvelope: true },
    tokenUrl: "https://api.cline.bot/api/v1/auth/token",
    refreshUrl: "https://api.cline.bot/api/v1/auth/refresh",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
      hooks: [
        "clineHeaders",
      ],
    },
  },
  models: [
    // --- Free Models (Utama / Prioritas Paling Atas) ---
    { id: "z-ai/glm-5.2:free", name: "GLM 5.2 (Free)" },
    { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash (Free Daily Limit)" },
    { id: "z-ai/glm-4.7-flash", name: "GLM 4.7 Flash" },
    { id: "z-ai/glm-4.5", name: "GLM 4.5" },

    // Google & NVIDIA Free Models
    { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B (Free)" },
    { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B (Free)" },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super 120B (Free)" },
    { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Nemotron 3 Ultra 550B (Free)" },
    { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "Nemotron 3 Nano Omni Reasoning (Free)" },
    { id: "nvidia/nemotron-3.5-lightning:free", name: "Nemotron 3.5 Lightning (Free)" },
    { id: "nvidia/nemotron-3.5-content-safety:free", name: "Nemotron 3.5 Content Safety (Free)" },

    // Coding, Agentic & Fast Free Models
    { id: "thinkingmachines/inkling:free", name: "Inkling (Free)" },
    { id: "thinkingmachines/inkling-small:free", name: "Inkling Small (Free)" },
    { id: "poolside/laguna-xs-2.1:free", name: "Laguna XS 2.1 (Free)" },
    { id: "poolside/laguna-s-2.1:free", name: "Laguna S 2.1 (Free)" },
    { id: "cohere/north-mini-code:free", name: "North Mini Code (Free)" },
    { id: "nex-agi/nex-n2.5-pro:free", name: "Nex N2.5 Pro (Free)" },
    { id: "liquid/lfm-2.5-2.6b:free", name: "LFM 2.5 2.6B (Free)" },
    { id: "dots-studio/dots-3-note-preview:free", name: "Dots 3 Note Preview (Free)" },

    // Domain & Vision Free Models
    { id: "inclusionai/ling-3.0-flash-vl:free", name: "Ling 3.0 Flash VL (Free)" },
    { id: "inclusionai/ling-3.0-flash-fin:free", name: "Ling 3.0 Flash Fin (Free)" },
    { id: "inclusionai/ling-3.0-flash-sante:free", name: "Ling 3.0 Flash Santé (Free)" },

    // Muse & Free Aggregator
    { id: "meta/muse-spark-1.3-contributor", name: "Muse Spark 1.3 Contributor" },
    { id: "meta/muse-spark-1.3", name: "Muse Spark 1.3" },
    { id: "meta/muse-spark-1.2-contributor", name: "Muse Spark 1.2 Contributor" },
    { id: "meta/muse-spark-1.2", name: "Muse Spark 1.2" },
    { id: "meta/muse-spark-1.1", name: "Muse Spark 1.1" },
    { id: "meta/muse-glimmer-30b", name: "Muse Glimmer 30B" },
    { id: "openrouter/free", name: "OpenRouter Free" },

    // --- Flagship Models (Berbayar / Pro) ---
    { id: "anthropic/claude-opus-4.7", name: "Claude Opus 4.7" },
    { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
    { id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6" },
    { id: "openai/gpt-5.3-codex", name: "GPT-5.3 Codex" },
    { id: "openai/gpt-5.4", name: "GPT-5.4" },
    { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
    { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview" },
    { id: "kwaipilot/kat-coder-pro", name: "KAT Coder Pro" },
  ],
  passthroughModels: true,
  oauth: {
    appBaseUrl: "https://app.cline.bot",
    apiBaseUrl: "https://api.cline.bot",
    authorizeUrl: "https://api.cline.bot/api/v1/auth/authorize",
    tokenExchangeUrl: "https://api.cline.bot/api/v1/auth/token",
    refreshUrl: "https://api.cline.bot/api/v1/auth/refresh",
    maxRefreshAgeMs: 259_200_000,
    refreshLeadMs: 60_000,
    trackRefreshAt: true,
  },
};

export default cline;

const clineFree = {
  id: "cline-free",
  priority: 79,
  alias: "cline-free",
  uiAlias: "cline-free",
  display: {
    name: "Cline Free",
    icon: "smart_toy",
    color: "#5B9BD5",
    textIcon: "CF",
    website: "https://cline.bot",
    notice: {
      signupUrl: "https://cline.bot",
    },
  },
  category: "oauth",
  authModes: ["oauth", "apikey"],
  hasOAuth: true,
    transport: {
      baseUrl: "https://api.cline.bot/api/v1/chat/completions",
      forceStream: true,
      headers: {
        "HTTP-Referer": "https://cline.bot",
        "X-Title": "Cline",
      },
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
    // Top Free Models (GLM Free Tier)
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

    // DeepSeek Free Models (verified live 2026-09-18: v4.1-flash + v4-flash-0731:free
    // answer correctly on free accounts; vision-exp/r1 hit 402 paid-only)
    { id: "deepseek/deepseek-v4-flash-0731:free", name: "DeepSeek V4 Flash (Free)" },
    // Moonshot AI Free Models
    { id: "moonshotai/kimi-k3", name: "Kimi K3 (Free)", contextLength: 262144 },
    // Free Aggregator
    { id: "openrouter/free", name: "OpenRouter Free" },
  ],
  passthroughModels: true,
  modelsFetcher: { url: "https://api.cline.bot/api/v1/models", type: "cline-free" },
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

export default clineFree;

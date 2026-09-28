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
    { id: "stealth/pixel-canary", name: "Pixel Canary (Free)", alias: "pixel-canary" },
    { id: "stealth/space-bunny-alpha", name: "Space Bunny Alpha (Free)", alias: "space-bunny-alpha" },
    {
      id: "cline-free/mimo-v2.6-flash",
      name: "MiMo-V2.6-Flash (Free)",
      alias: "mimo-v2.6-flash",
      aliases: ["xiaomi/mimo-v2.6-flash"],
      upstreamModelId: "cline-free/mimo-v2.6-flash",
    },
    {
      id: "cline-free/deepseek-v4.1-flash",
      name: "DeepSeek V4.1 Flash (Free)",
      alias: "deepseek-v4.1-flash",
      aliases: ["deepseek/deepseek-v4.1-flash"],
      upstreamModelId: "cline-free/deepseek-v4.1-flash",
    },
    {
      id: "cline-free/gemini-3.8-flash",
      name: "Gemini 3.8 Flash (Free)",
      alias: "gemini-3.8-flash",
      aliases: ["google/gemini-3.8-flash"],
      upstreamModelId: "cline-free/gemini-3.8-flash",
    },
    {
      id: "cline-free/muse-spark-1.3-contributor",
      name: "Muse Spark 1.3 Contributor (Free)",
      alias: "muse-spark-1.3-contributor",
      aliases: ["meta/muse-spark-1.3-contributor"],
      upstreamModelId: "cline-free/muse-spark-1.3-contributor",
    },
  ],
  passthroughModels: true,
  modelsFetcher: { url: "https://api.cline.bot/api/v1/ai/cline/recommended-models", type: "cline-free" },
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

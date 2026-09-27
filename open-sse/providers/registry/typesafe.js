export default {
  id: "typesafe",
  priority: 215,
  alias: "typesafe",
  aliases: [
    "ts",
    "typesafe-ai",
  ],
  uiAlias: "ts",
  display: {
    name: "TypeSafe AI (Jev)",
    icon: "psychology",
    color: "#0EA5E9",
    textIcon: "TS",
    website: "https://typesafe.ai",
    notice: {
      text: "TypeSafe System One (Jev) classifier: answers structured questions (difficulty / ambiguity / domain), it is not a free-form chat API. Every connection added here joins the key pool the combo Difficulty Judge rotates over.",
      apiKeyUrl: "https://console.typesafe.ai",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    baseUrl: "https://api.typesafe.ai/v1",
    // Live probe: only /v1/systemone (POST) and /v1/models (GET) exist — there is no
    // /chat/completions, so validateUrl is what the dashboard "test key" flow hits.
    validateUrl: "https://api.typesafe.ai/v1/models",
  },
  models: [
    { id: "jev-latest", name: "Jev Latest (System One)" },
  ],
};

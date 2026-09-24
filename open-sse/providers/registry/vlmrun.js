export default {
  id: "vlmrun",
  priority: 61,
  alias: "vlmr",
  aliases: [
    "vlmrun",
    "vlm-run",
  ],
  uiAlias: "vlmr",
  display: {
    name: "VLM Run",
    icon: "visibility",
    color: "#6366F1",
    textIcon: "VR",
    website: "https://vlm.run",
    notice: {
      text: "Vision-language model gateway. 240 RPM, 10,000/hr with API key + $10 free signup balance.",
      apiKeyUrl: "https://app.vlm.run/dashboard/settings/api-keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://gateway.vlm.run/v1/openai/chat/completions",
    validateUrl: "https://gateway.vlm.run/v1/openai/models",
  },
  models: [
    { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", contextLength: 262144, reasoning: true, vision: true },
  ],
  modelsFetcher: { url: "https://gateway.vlm.run/v1/openai/models", type: "openai" },
  passthroughModels: true,
};

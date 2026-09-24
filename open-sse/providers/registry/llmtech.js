export default {
  id: "llmtech",
  priority: 62,
  alias: "lt",
  aliases: [
    "llmtech",
    "llm-tech",
  ],
  uiAlias: "lt",
  display: {
    name: "LLM Tech",
    icon: "memory",
    color: "#059669",
    textIcon: "LT",
    website: "https://llmtech.eu",
    notice: {
      text: "EU-hosted Qwen 3.8 27B NVFP4 on Blackwell. 64 concurrent, unlimited tokens. $0.25/$2.09 per 1M tokens.",
      apiKeyUrl: "https://llmtech.eu/docs/",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.llmtech.eu/v1/chat/completions",
  },
  models: [
    { id: "nvidia/Qwen3.8-27B-NVFP4", name: "Qwen 3.8 27B NVFP4 (EU)", contextLength: 262144, reasoning: true, vision: true },
  ],
};

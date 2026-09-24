export default {
  id: "llmtech-free",
  priority: 47,
  hasFree: true,
  alias: "ltf",
  aliases: [
    "llmtech-free",
    "llm-tech-free",
  ],
  uiAlias: "ltf",
  display: {
    name: "LLM Tech Free",
    icon: "memory",
    color: "#059669",
    textIcon: "LT",
    website: "https://llmtech.eu",
    notice: {
      text: "EU-hosted Qwen 3.8 27B NVFP4 on Blackwell. 2 concurrent, 2M tokens/day. Zero data retention.",
    },
  },
  category: "free",
  noAuth: true,
  trialKey: true,
  transport: {
    baseUrl: "https://api.llmtech.eu/v1/chat/completions",
    noAuth: true,
    headers: {
      "Authorization": "Bearer lt-trial-ba1ef28c6d32ed6980678d8d",
    },
  },
  models: [
    { id: "nvidia/Qwen3.8-27B-NVFP4", name: "Qwen 3.8 27B NVFP4 (EU)", contextLength: 262144, reasoning: true, vision: true },
  ],
};

import { CLAUDE_API_HEADERS } from "../shared.js";

export default {
  id: "morphllm",
  alias: "morphllm",
  aliases: ["mrp", "morph"],
  uiAlias: "mrp",
  display: {
    name: "MorphLLM",
    icon: "change_history",
    color: "#14B8A6",
    textIcon: "MP",
    website: "https://morphllm.com",
    notice: { apiKeyUrl: "https://morphllm.com" },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.morphllm.com/v1/chat/completions",
    validateUrl: "https://api.morphllm.com/v1/models",
  },
  transports: [
    {
      format: "openai",
      baseUrl: "https://api.morphllm.com/v1/chat/completions",
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
    },
    {
      format: "claude",
      baseUrl: "https://api.morphllm.com/v1/messages",
      headers: { ...CLAUDE_API_HEADERS },
      auth: { combined: true, header: "x-api-key", scheme: "raw" },
    },
  ],
  models: [
    { id: "morph-dsv41flash", name: "DeepSeek V4.1 Flash", contextLength: 1048576, vision: true, reasoning: true },
    { id: "morph-kimik3", name: "Kimi K3 2.8T", contextLength: 1048576, vision: true, reasoning: true },
    { id: "morph-kimik3-fast", name: "Kimi K3 Fast", contextLength: 1048576, vision: true, reasoning: true },
    { id: "morph-glm53-744b", name: "GLM-5.3 744B", contextLength: 1048576, reasoning: true },
    { id: "morph-glm53flash", name: "GLM-5.3-Flash", contextLength: 1048576, vision: true, reasoning: true },
    { id: "morph-dsv4flash", name: "DeepSeek V4 Flash", contextLength: 1048576, reasoning: true },
  ],
};

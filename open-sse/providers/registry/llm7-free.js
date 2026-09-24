export default {
  id: "llm7-free",
  priority: 44,
  hasFree: true,
  alias: "l7f",
  aliases: [
    "llm7-free",
    "llm-7-free",
  ],
  uiAlias: "l7f",
  display: {
    name: "LLM7 Free",
    icon: "pool",
    color: "#7C3AED",
    textIcon: "L7",
    website: "https://llm7.io",
    notice: {
      text: "500k tokens/day, 10 RPM anonymous. Free token at dash.llm7.io doubles limits.",
    },
  },
  category: "free",
  noAuth: true,
  transport: {
    baseUrl: "https://api.llm7.io/v1/chat/completions",
    noAuth: true,
  },
  models: [
    { id: "GLM-5.3-Flash", name: "GLM 5.3 Flash", contextLength: 131072, reasoning: true },
    { id: "codestral-latest", name: "Codestral (Mistral)", contextLength: 256000, reasoning: true },
    { id: "mistral-Nemo-Instruct-2407", name: "Mistral Nemo 12B", contextLength: 128000 },
  ],
};

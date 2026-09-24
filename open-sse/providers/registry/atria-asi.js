export default {
  id: "atria-asi",
  priority: 75,
  alias: "atria-asi",
  display: {
    name: "Atria ASI",
    icon: "science",
    color: "#6366F1",
    textIcon: "AT",
    website: "https://atria-asi.ai",
    notice: {
      apiKeyUrl: "https://api.atria-asi.ai/console/keys",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.atria-asi.ai/v1/responses",
    validateUrl: "https://api.atria-asi.ai/v1/models",
    format: "openai-responses",
  },
  models: [
    { id: "Atria-Dawn-Preview", name: "Atria Dawn Preview", targetFormat: "openai-responses" },
  ],
  serviceKinds: ["llm"],
};

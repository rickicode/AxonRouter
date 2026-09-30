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
    // Upstream prefill runs 20-95s before the first frame, well past the
    // 8s default commit peek. The peek then times out, is treated as
    // inconclusive and commits as a success — so a slow-but-healthy answer is
    // recorded as EMPTY-COMMITTED and never retried. Measured in production:
    // ttft 20681/6965/95123 ms across three consecutive requests.
    commitPeekMs: 120000,
  },
  models: [
    { id: "Atria-Dawn-Preview", name: "Atria Dawn Preview", targetFormat: "openai-responses" },
  ],
  serviceKinds: ["llm"],
};

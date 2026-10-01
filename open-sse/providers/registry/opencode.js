export default {
  id: "opencode",
  priority: 40,
  hasFree: true,
  alias: "oc",
  uiAlias: "oc",
  display: {
    name: "OpenCode Free",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
  },
  category: "free",
  noAuth: true,
  serviceKinds: ["llm", "jev"],
  jevConfig: {
    endpoint: "https://opencode.ai/zen/v1/systemone",
    models: [
      { id: "jev-1.13-free", name: "Jev 1.13 Free (System One)", default: true },
      { id: "jev-1.13", name: "Jev 1.13 (System One)", requiresKey: true },
    ],
  },
  transport: {
    baseUrl: "https://opencode.ai",
    headers: {
      "x-opencode-client": "desktop",
    },
    noAuth: true,
    forceStream: true,
    quirks: {
      forceAutoToolChoiceModels: [
        "muse-spark-1.2-contributor-free",
        "muse-spark-1.3-contributor-free",
      ],
    },
  },
  forceStream: true,
  models: [
    // System One (Jev) classifier models
    { id: "jev-1.13-free", name: "Jev 1.13 Free (System One)", targetFormat: "systemone", kind: "jev", default: true },
    { id: "jev-1.13", name: "Jev 1.13 (System One)", targetFormat: "systemone", kind: "jev" },
    // Muse Spark models are served by /zen/v1/responses; the rest stay on
    // /chat/completions, so the format is declared per-model, not per-provider.
    { id: "muse-spark-1.2-contributor-free", name: "Muse Spark 1.2 Contributor Free", targetFormat: "openai-responses" },
    { id: "muse-spark-1.3-contributor-free", name: "Muse Spark 1.3 Contributor Free", targetFormat: "openai-responses" },
    // union-alpha used to live here, served by /zen/v1/messages (Claude transport,
    // reverse-engineered from the genuine CLI 1.18.31, 2026-09-17). It is gone
    // upstream as of 2026-10-01: both /zen/v1/chat/completions and
    // /zen/v1/messages answer 401 "Model union-alpha is not supported", which is a
    // model-existence error and not the per-egress free-tier gate — every request to
    // it failed, and no combo referenced it. Re-add it if OpenCode brings it back.
  ],
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" },
  passthroughModels: true,
};

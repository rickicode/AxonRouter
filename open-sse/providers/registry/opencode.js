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
    // Verified free models on /chat/completions
    { id: "space-bunny-free", name: "Space Bunny Free" },
    { id: "big-pickle", name: "Big Pickle (Free)" },
    { id: "longcat-2.5-preview-free", name: "LongCat 2.5 Preview (Free)" },
    { id: "mimo-v2.6-flash-free", name: "MiMo V2.6 Flash (Free)" },
    { id: "mimo-v2.5-free", name: "MiMo V2.5 (Free)" },
    { id: "nemotron-3.5-lightning-free", name: "Nemotron 3.5 Lightning (Free)" },
    { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra (Free)" },
    { id: "ling-3.0-flash-fin-free", name: "Ling 3.0 Flash Fin (Free)" },
    { id: "fledge-alpha-free", name: "Fledge Alpha (Free)" },
  ],
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" },
  passthroughModels: true,
};

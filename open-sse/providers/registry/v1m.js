// v1m (System One) — a third-party calibrated decision engine.
//
// Upstream ships this as a native `systemone` capability (systemoneConfig +
// serviceKinds:["systemone"]). This tree has no `systemone` subsystem: the whole
// native-decision mechanism was renamed and generalized to `jev` — same wire
// protocol (POST { model, state, questions }, answers returned untouched), same
// endpoint shape, same picker (`/dashboard/capabilities-providers/jev`). Porting
// the entry onto `jevConfig` is therefore a rename, not a behaviour change: v1m
// joins the classifier picker and the combo Difficulty Judge key pool exactly as
// `typesafe` does, instead of landing as an unreachable config block.
export default {
  id: "v1m",
  priority: 45,
  alias: "v1m",
  aliases: ["systemone", "jev"],
  uiAlias: "v1m",
  display: {
    name: "v1m (System One)",
    icon: "psychology",
    color: "#6366F1",
    textIcon: "V1",
    website: "https://v1m.ir",
    notice: {
      text: "v1m System One calibrated decision engine. Fast probabilistic evaluations over state and questions.",
      apiKeyUrl: "https://v1m.ir",
    },
  },
  category: "apikey",
  authType: "apikey",
  hasProviderSpecificData: true,
  serviceKinds: ["jev"],
  jevConfig: {
    endpoint: "https://v1m.ir/v1/systemone",
    models: [
      { id: "rev-latest", name: "v1m Rev Latest (Calibrated)", default: true, requiresKey: true },
      { id: "v1m-decision-engine", name: "v1m Decision Engine", requiresKey: true },
    ],
    keyPool: true,
  },
  models: [
    { id: "rev-latest", name: "v1m Rev Latest (Calibrated)", kind: "jev", targetFormat: "systemone", default: true },
    { id: "v1m-decision-engine", name: "v1m Decision Engine", kind: "jev", targetFormat: "systemone" },
  ],
};
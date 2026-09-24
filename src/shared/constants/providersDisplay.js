// UI display config — all providers derive from the registry UI projection.
import { REGISTRY_UI } from "open-sse/providers/registry/ui.js";

export const RISK_NOTICE = "⚠️ Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.";

// Resolve "RISK_NOTICE" token → real notice text (registry stores token to avoid import cycle)
const resolveDisplay = (d) =>
  d.deprecationNotice === "RISK_NOTICE" ? { ...d, deprecationNotice: RISK_NOTICE } : d;

export const PROVIDER_DISPLAY = Object.fromEntries(
  REGISTRY_UI.filter((r) => r.display).map((r) => [r.id, resolveDisplay(r.display)]),
);

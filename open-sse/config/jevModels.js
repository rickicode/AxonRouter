// System One (Jev) classifier models — single source of truth for the combo
// model picker, settings validation and the upstream resolver.
//
// Pure data with no server-only imports: the dashboard bundle (SmartRoutingSection)
// and open-sse/services/jevUpstream.js both read from here.
//
// Two upstreams answer the same classifier API:
//   • TypeSafe AI direct — https://api.typesafe.ai/v1/systemone, model "jev-latest",
//     Bearer key required (keys live in the "typesafe" connection pool).
//   • OpenCode Zen       — https://opencode.ai/zen/v1/systemone, models
//     "jev-1.13-free" (free, no key) / "jev-1.13" (pay-as-you-go, needs a Zen key).

export const TYPESAFE_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
export const ZEN_SYSTEMONE_URL = "https://opencode.ai/zen/v1/systemone";

export const JEV_MODEL_TYPESAFE = "jev-latest";
export const JEV_MODEL_ZEN_FREE = "jev-1.13-free";
export const JEV_MODEL_ZEN = "jev-1.13";

/** Zen models (System One served through OpenCode Zen). */
export const JEV_ZEN_MODELS = [JEV_MODEL_ZEN_FREE, JEV_MODEL_ZEN];

/** Every selectable classifier model. */
export const JEV_ALL_MODELS = [JEV_MODEL_ZEN_FREE, JEV_MODEL_ZEN, JEV_MODEL_TYPESAFE];

/** Default picker value: free Zen tier, works without any API key. */
export const DEFAULT_JEV_MODEL = JEV_MODEL_ZEN_FREE;

const JEV_MODEL_ENDPOINTS = {
  [JEV_MODEL_TYPESAFE]: TYPESAFE_SYSTEMONE_URL,
  [JEV_MODEL_ZEN_FREE]: ZEN_SYSTEMONE_URL,
  [JEV_MODEL_ZEN]: ZEN_SYSTEMONE_URL,
};

/** Endpoint for a known model id; null when the id is not a Jev model. */
export function jevEndpointForModel(model) {
  return JEV_MODEL_ENDPOINTS[model] || null;
}

/** "zen" | "typesafe" | null (unknown model → caller decides from what is available). */
export function jevModelFamily(model) {
  const endpoint = jevEndpointForModel(model);
  if (!endpoint) return null;
  return endpoint === ZEN_SYSTEMONE_URL ? "zen" : "typesafe";
}

/** True when an endpoint is one of the two upstreams we know (rejects arbitrary URLs). */
export function isKnownJevEndpoint(url) {
  return url === TYPESAFE_SYSTEMONE_URL || url === ZEN_SYSTEMONE_URL;
}

/**
 * Combo picker options — value is what gets stored in combo config `jevModel`
 * (and global settings `jevModel`); the endpoint is derived, never hand-edited.
 */
export const JEV_MODEL_CHOICES = [
  { value: JEV_MODEL_ZEN_FREE, label: "OpenCode Zen / jev-1.13-free (Default, Free)", endpoint: ZEN_SYSTEMONE_URL },
  { value: JEV_MODEL_ZEN, label: "OpenCode Zen / jev-1.13 (Pay-as-you-go)", endpoint: ZEN_SYSTEMONE_URL },
  { value: JEV_MODEL_TYPESAFE, label: "TypeSafe AI / jev-latest (Direct TypeSafe)", endpoint: TYPESAFE_SYSTEMONE_URL },
];

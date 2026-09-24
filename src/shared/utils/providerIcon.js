// Provider icon paths under /public/providers.
// Alias related brands; session-cache 404s so one miss never spams again.

const ICON_ALIASES = {
  "perplexity-agent": "perplexity",
  "gitlab-duo": "gitlab",
  "vercel-ai-gateway": "vercel",
  "ollama-search": "ollama",
  "cline-free": "cline",
  "kilocode-free": "kilocode",
  "kcf": "kilocode",
  "kilo-free": "kilocode",
  "kf": "kilocode",
  "orca": "orcarouter",
  "th": "tokenharbor",
  "tharbor": "tokenharbor",
  "opencode-zen": "opencode",
  "opencode-go": "opencode",
  "zen": "opencode",
  "ocz": "opencode",
  "morphllm": "morphllm",
  "mrp": "morphllm",
  "morph": "morphllm",
  "lt": "llmtech",
  "vlmr": "vlmrun",
  "ovh": "ovhcloud",
  "ovhcloud-free": "ovhcloud",
  "ovhcf": "ovhcloud",
  "llmtech-free": "llmtech",
  "ltf": "llmtech",
  "llm7-free": "llm7",
  "l7f": "llm7",
};

// Runtime only — first 404 remembers id for the whole session
const failedIds = new Set();

function normalizeId(providerId) {
  if (!providerId || typeof providerId !== "string") return "";
  return providerId.trim().toLowerCase();
}

/** Resolve icon file id (after alias). Empty if previously failed this session. */
export function resolveProviderIconId(providerId) {
  const id = normalizeId(providerId);
  if (!id) return "";
  if (failedIds.has(id)) return "";

  // Dynamic custom compatible provider mapping
  if (id.startsWith("anthropic-compatible-")) {
    return "anthropic-m";
  }
  if (id.startsWith("openai-compatible-responses-")) {
    return "oai-r";
  }
  if (id.startsWith("openai-compatible-chat-") || id.startsWith("openai-compatible-")) {
    return "oai-cc";
  }

  const aliased = ICON_ALIASES[id] || id;
  if (failedIds.has(aliased)) return "";
  return aliased;
}

/** `/providers/{id}.png` or null when previously failed. */
export function getProviderIconSrc(providerId) {
  const id = resolveProviderIconId(providerId);
  return id ? `/providers/${id}.png` : null;
}

/** Call from img onError so later mounts skip the request. */
export function markProviderIconMissing(providerId) {
  const id = normalizeId(providerId);
  if (id) failedIds.add(id);
  const aliased = ICON_ALIASES[id];
  if (aliased) failedIds.add(aliased);
}

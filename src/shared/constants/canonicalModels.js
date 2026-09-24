// Canonical model normalization for the "dedupe/redundancy" view in model
// pickers. The same underlying model is exposed under many provider bindings
// (e.g. glm-5.3-flash via cline-free/z-ai/glm-5.3-flash, ocz/glm-5.3-flash,
// tokenrouter/z-ai/glm-5.3-free). This module maps every provider/model value
// to one canonical family id so the UI can collapse the redundant list into
// "core models" (requestable bare, no alias) and show which providers serve each.
//
// Rules (cheap, deterministic — not a heuristic model family guesser):
// 1. Strip the leading vendor prefix (z-ai/, google/, deepseek/, …). Models
//    WITHOUT a known vendor prefix are "non-common" (e.g. Atria-Dawn-Preview)
//    and pass through unchanged — they are their own canonical family.
// 2. Strip :free / :batch suffixes.
// 3. Lowercase.
// Unknown prefixes are left in place (never guess — a wrong dedupe merges
// different models like nemotron vs nemotron-3.5, which is strictly worse).

// Vendor prefixes that are NOT the model identity (they repeat across providers).
export const VENDOR_MODEL_PREFIXES = [
  "accounts",
  "anthropic",
  "black-forest-labs",
  "bytedance",
  "bytedance-seed",
  "cline-pass",
  "cohere",
  "deepseek",
  "deepseek-ai",
  "dots-studio",
  "fal-ai",
  "google",
  "grok",
  "inclusionai",
  "kilo-auto",
  "kwaipilot",
  "kwaivgi",
  "liquid",
  "meta",
  "meta-llama",
  "mimo",
  "minimax",
  "minimaxai",
  "moonshotai",
  "nex-agi",
  "nomic-ai",
  "nvidia",
  "openai",
  "openrouter",
  "orcarouter",
  "perplexity",
  "poolside",
  "qwen",
  "stabilityai",
  "stepfun",
  "tencent",
  "thinkingmachines",
  "togethercomputer",
  "tokenharbor",
  "upstage",
  "x-ai",
  "xai",
  "xiaomi",
  "z-ai",
  "zai-org",
];

const PREFIX_SET = new Set(VENDOR_MODEL_PREFIXES);
// Trailing free/batch markers: "mimo-v2.5-free" (oc) and "mimo-v2.5:free"
// (th) are the same model family. Stripped at the very end so vendor-stripped
// ids group with bare names. NOT used for vendor-prefix detection above, so a
// genuinely distinct free model keeps its named suffix when needed.
const SUFFIX_RE = /:(free|batch)$/;
const TRAILING_FREE_RE = /-free$|:(free|batch)$/i;

/**
 * "cline-free/z-ai/glm-5.3-flash" → "glm-5.3-flash"
 * "openrouter/deepseek/deepseek-v4-flash-0731:free" → "deepseek-v4-flash-0731"
 * "oc/mimo-v2.5-free" → "mimo-v2.5"   (same family as th's "mimo-v2.5:free")
 * "atria/Atria-Dawn-Preview" → "atria-dawn-preview" (no vendor prefix: kept whole)
 * @param {string} value provider/model value
 * @returns {string} canonical model family id (lowercase)
 */
export function canonicalModelId(value) {
  if (!value || typeof value !== "string") return "";
  let v = value.trim();
  const slash = v.indexOf("/");
  if (slash <= 0) return v.toLowerCase().replace(SUFFIX_RE, "");
  const modelPart = v.slice(slash + 1);
  const firstSlash = modelPart.indexOf("/");
  const firstSegment = firstSlash > 0 ? modelPart.slice(0, firstSlash) : modelPart;
  // Strip ONLY when the first segment is a known vendor prefix; otherwise keep.
  let id;
  if (PREFIX_SET.has(firstSegment)) {
    id = modelPart.slice(firstSlash + 1);
  } else {
    id = modelPart;
  }
  return id.toLowerCase().replace(TRAILING_FREE_RE, "");
}

/**
 * Whether a model value is a recognized vendor-prefixed binding (dedupable)
 * vs a "non-common"/unique model that stands alone.
 */
export function isVendorPrefixed(value) {
  if (!value || typeof value !== "string") return false;
  const slash = value.indexOf("/");
  if (slash <= 0) return false;
  const modelPart = value.slice(slash + 1);
  const firstSegment = modelPart.slice(0, modelPart.indexOf("/")) || modelPart;
  return PREFIX_SET.has(firstSegment);
}
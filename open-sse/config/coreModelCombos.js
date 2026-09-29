// Core model families — the "default combo without alias" map.
//
// Canonical model name (bare, no provider prefix) → member bindings across
// built-in providers ONLY (user-defined provider nodes are never referenced).
// Requesting "deepseek-v4-flash", "deepseek-flash-latest", "mimo-latest", …
// routes through handleComboChat over the member list
// (fallback + health-reorder + dead-member fast-skip already built).
//
// Gemini is Antigravity only (`ag/`). Other gemini bindings (gemini/, bai/,
// orca/, ocz/) are not members: invalid key, 402, or 401 in production logs.
//
// Retired 2026-09-21 (combo cleanup): glm-5.3-flash → glm-latest,
// deepseek-v4.1-flash (as combo name) → deepseek-flash-latest,
// mimo-v2.5 → mimo-latest, gpt-5.6-luna → gpt-latest,
// claude-haiku-4-5 → claude-latest, gemini-3.8-flash → gemini-flash-latest,
// muse-spark → muse-spark-latest, smart-model removed.
// auto/* uses difficulty routing seeded in seedDefaultCombos.js.

export const CORE_MODEL_COMBOS = {
  "deepseek-v4-flash": [
    "clf/deepseek/deepseek-v4.1-flash",
    "th/deepseek-v4.1-flash:free",
  ],
  "deepseek-v4-pro": [
    "th/deepseek-v4.1-flash:free",
    "clf/deepseek/deepseek-v4.1-flash",
    "cloudflare-ai/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  ],
};

export const GENERAL_LATEST_COMBOS = {
  "grok-latest": [
    "gcli/grok-4.7",
    "gcli/grok-4.7-high",
    "gcli/grok-4.7-xhigh",
    "gcli/grok-4.6",
    "gcli/grok-4.6-high",
  ],
  "mimo-latest": [
    "clf/mimo-v2.6-flash",
    "th/mimo-v2.6-flash:free",
    "oc/mimo-v2.6-flash-free",
    "oc/mimo-v2.5-free",
    "ocz/mimo-v2.5-free",
    "th/mimo-v2.5:free",
  ],
  "muse-spark-latest": [
    "clf/muse-spark-1.3-contributor",
    "ocz/muse-spark-1.3-contributor-free",
    "ocz/muse-spark-1.2-contributor-free",
    "oc/muse-spark-1.3-contributor-free",
    "oc/muse-spark-1.2-contributor-free",
  ],
  "gemini-flash-latest": [
    "ag/gemini-3.8-flash-high",
    "ag/gemini-3.8-flash-medium",
    "ag/gemini-3.8-flash-low",
    "ag/gemini-3.7-flash-high",
    "ag/gemini-3.7-flash-medium",
    "ag/gemini-3.7-flash-low",
    "ag/gemini-3.6-flash-high",
    "ag/gemini-3.6-flash-medium",
    "ag/gemini-3.6-flash-low",
  ],
  "gemini-pro-latest": [
    "ag/gemini-3.1-pro-low",
  ],
  "claude-latest": [
    "ag/claude-opus-4-6-thinking",
  ],
  "glm-latest": [
    "cloudflare-ai/@cf/zai-org/glm-4.7-flash",
    "runanywhere/glm-5.3-flash",
  ],
  "deepseek-flash-latest": [
    "clf/deepseek/deepseek-v4.1-flash",
    "th/deepseek-v4.1-flash:free",
  ],
  "deepseek-pro-latest": [
    "th/deepseek-v4.1-flash:free",
    "clf/deepseek/deepseek-v4.1-flash",
    "cloudflare-ai/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  ],
  "gpt-latest": [
    "cx/gpt-5.6-luna",
    "cx/gpt-5.6-luna-review",
    "cx/gpt-5.6-terra",
    "cx/gpt-5.6-terra-review",
  ],
  "open-weight-latest": [
    "clf/stealth/pixel-canary",
    "clf/stealth/space-bunny-alpha",
    "clf/mimo-v2.6-flash",
    "clf/deepseek-v4.1-flash",
    "clf/muse-spark-1.3-contributor",
    "cloudflare-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "cloudflare-ai/@cf/meta/llama-3.1-8b-instruct-fp8",
    "cloudflare-ai/@cf/zai-org/glm-4.7-flash",
    "th/deepseek/deepseek-v4.1-flash:free",
    "ocz/muse-spark-1.3-contributor-free",
    "oc/mimo-v2.6-flash-free",
    "oc/big-pickle",
    "kcf/poolside/laguna-s-2.1:free",
    "kcf/inclusionai/ling-3.0-flash-sante:free",
    "kcf/stepfun/step-3.7-flash:free",
  ],
  "auto/coding": [
    "ag/gemini-3.8-flash-high",
    "gcli/grok-4.7",
    "clf/stealth/pixel-canary",
    "clf/stealth/space-bunny-alpha",
    "clf/mimo-v2.6-flash",
    "clf/deepseek-v4.1-flash",
    "clf/muse-spark-1.3-contributor",
    "cx/gpt-5.6-luna",
    "ocz/muse-spark-1.3-contributor-free",
    "kcf/poolside/laguna-s-2.1:free",
    "kcf/cohere/north-mini-code:free",
  ],
  "auto/writing": [
    "ag/gemini-3.8-flash-high",
    "gcli/grok-4.7",
    "cx/gpt-5.6-luna",
    "clf/deepseek-v4.1-flash",
    "clf/mimo-v2.6-flash",
    "clf/stealth/space-bunny-alpha",
    "ocz/muse-spark-1.3-contributor-free",
    "ocz/muse-spark-1.2-contributor-free",
    "oc/muse-spark-1.2-contributor-free",
    "oc/big-pickle",
    "oc/mimo-v2.5-free",
    "kcf/stepfun/step-3.7-flash:free",
    "kcf/kilo-auto/free",
  ],
  "auto/socmed": [
    "ag/gemini-3.8-flash-high",
    "gcli/grok-4.7",
    "clf/mimo-v2.6-flash",
    "cx/gpt-5.6-luna",
    "oc/big-pickle",
    "oc/mimo-v2.5-free",
    "ocz/muse-spark-1.3-contributor-free",
    "kcf/cohere/north-mini-code:free",
    "kcf/kilo-auto/free",
  ],
};

export function getCoreComboMembers(canonicalName) {
  const key = String(canonicalName || "").replace(/[:^]free$/i, "").trim().toLowerCase();
  return CORE_MODEL_COMBOS[key] || GENERAL_LATEST_COMBOS[key] || null;
}

export function isGeneralLatestCombo(name) {
  return Object.prototype.hasOwnProperty.call(GENERAL_LATEST_COMBOS, String(name || ""));
}

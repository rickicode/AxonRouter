import REGISTRY from "../providers/registry/index.js";

// Alias→id derived from registry single-source: id→id, alias→id, aliases[]→id.
// Media-only providers without a registry transport entry keep explicit aliases here.
const MEDIA_ONLY_ALIASES = {
  el: "elevenlabs",
  jina: "jina-ai",
  "jina-ai": "jina-ai",
  polly: "aws-polly",
  "aws-polly": "aws-polly",
};

const ALIAS_TO_PROVIDER_ID = { ...MEDIA_ONLY_ALIASES };
for (const entry of REGISTRY) {
  ALIAS_TO_PROVIDER_ID[entry.id] = entry.id;
  if (entry.alias) ALIAS_TO_PROVIDER_ID[entry.alias] = entry.id;
  for (const a of entry.aliases || []) ALIAS_TO_PROVIDER_ID[a] = entry.id;
}

const BUILTIN_MODEL_ALIASES = {
  "grok-4.7": "gcli/grok-4.7",
  "grok-4.7-xhigh": "gcli/grok-4.7-xhigh",
  "grok-4.7-high": "gcli/grok-4.7-high",
  "grok-4.7-medium": "gcli/grok-4.7-medium",
  "grok-4.7-low": "gcli/grok-4.7-low",
  "grok-build": "gcli/grok-build",
  "grok-4.6": "gcli/grok-4.6",
  "grok-4.6-xhigh": "gcli/grok-4.6-xhigh",
  "grok-4.6-high": "gcli/grok-4.6-high",
  "grok-4.6-medium": "gcli/grok-4.6-medium",
  "grok-4.6-low": "gcli/grok-4.6-low",
  "grok-4.5": "gcli/grok-4.5",
  "z-ai/glm-5.3-flash": "cline-free/z-ai/glm-5.3-flash",
  "poolside/laguna-s-2.1:free": "cline-free/poolside/laguna-s-2.1:free",
  "poolside/laguna-s-2.1": "cline-free/poolside/laguna-s-2.1:free",
  "laguna-s-2.1:free": "cline-free/poolside/laguna-s-2.1:free",
  "laguna-s-2.1": "cline-free/poolside/laguna-s-2.1:free",
  "deepseek/deepseek-v4.1-flash": "cline-free/deepseek/deepseek-v4.1-flash",
  "meta/muse-spark-1.3-contributor": "cline-free/meta/muse-spark-1.3-contributor",
  "upstage/solar-pro4": "cline-free/upstage/solar-pro4",
  "solar-pro4": "cline-free/upstage/solar-pro4",
};
/**
 * Resolve provider alias to provider ID
 */
export function resolveProviderAlias(aliasOrId) {
  return ALIAS_TO_PROVIDER_ID[aliasOrId] || aliasOrId;
}

/**
 * Parse model string: "alias/model" or "provider/model" or just alias
 */
export function parseModel(modelStr) {
  if (!modelStr) {
    return { provider: null, model: null, isAlias: false, providerAlias: null };
  }

  if (BUILTIN_MODEL_ALIASES[modelStr]) {
    const aliased = BUILTIN_MODEL_ALIASES[modelStr];
    const firstSlash = aliased.indexOf("/");
    const providerOrAlias = aliased.slice(0, firstSlash);
    const model = aliased.slice(firstSlash + 1);
    const provider = resolveProviderAlias(providerOrAlias);
    return { provider, model, isAlias: false, providerAlias: providerOrAlias };
  }
  // Check if standard format: provider/model or alias/model
  if (modelStr.includes("/")) {
    const firstSlash = modelStr.indexOf("/");
    const providerOrAlias = modelStr.slice(0, firstSlash);
    const model = modelStr.slice(firstSlash + 1);
    const provider = resolveProviderAlias(providerOrAlias);
    if (ALIAS_TO_PROVIDER_ID[providerOrAlias] || ALIAS_TO_PROVIDER_ID[provider]) {
      return { provider, model, isAlias: false, providerAlias: providerOrAlias };
    }
  }

  // Alias format (model alias, not provider alias)
  return {
    provider: null,
    model: modelStr,
    isAlias: true,
    providerAlias: null,
  };
}

/**
 * Resolve model alias from aliases object
 * Format: { "alias": "provider/model" }
 */
export function resolveModelAliasFromMap(alias, aliases) {
  if (!aliases) return null;

  // Check if alias exists
  const resolved = aliases[alias];
  if (!resolved) return null;

  // Resolved value is "provider/model" format
  if (typeof resolved === "string" && resolved.includes("/")) {
    const firstSlash = resolved.indexOf("/");
    const providerOrAlias = resolved.slice(0, firstSlash);
    return {
      provider: resolveProviderAlias(providerOrAlias),
      model: resolved.slice(firstSlash + 1),
    };
  }

  // Or object { provider, model }
  if (typeof resolved === "object" && resolved.provider && resolved.model) {
    return {
      provider: resolveProviderAlias(resolved.provider),
      model: resolved.model,
    };
  }

  return null;
}

/**
 * Get full model info (parse or resolve)
 * @param {string} modelStr - Model string
 * @param {object|function} aliasesOrGetter - Aliases object or async function to get aliases
 */
export async function getModelInfoCore(modelStr, aliasesOrGetter) {
  const parsed = parseModel(modelStr);

  if (!parsed.isAlias) {
    return {
      provider: parsed.provider,
      model: parsed.model,
    };
  }

  // Get aliases (from object or function)
  const aliases =
    typeof aliasesOrGetter === "function"
      ? await aliasesOrGetter()
      : aliasesOrGetter;

  // Resolve alias
  const resolved =
    resolveModelAliasFromMap(parsed.model, aliases) ||
    resolveModelAliasFromMap(parsed.model, BUILTIN_MODEL_ALIASES);
  if (resolved) {
    return resolved;
  }

  // Check if parsed.model matches a known model in any registry provider
  if (parsed.model.includes("/")) {
    for (const entry of REGISTRY) {
      if (Array.isArray(entry.models) && entry.models.some((m) => m.id === parsed.model || m.id === `${parsed.model}:free` || (typeof m.id === "string" && m.id.endsWith("/" + parsed.model)))) {
        return {
          provider: entry.id,
          model: parsed.model,
        };
      }
    }
  }
  // Fallback: infer provider from model name prefix
  return {
    provider: inferProviderFromModelName(parsed.model),
    model: parsed.model,
  };
}

// Config-driven prefix → provider inference (first match wins, fallback "openai").
const MODEL_PREFIX_PROVIDERS = [
  // Codex CLI sends this bare virtual model for auto-review — keep it on OAuth Codex (#1398).
  [/^codex-auto-review$/, "codex"],
  [/^atria-/, "atria-asi"],
  [/^claude-/, "anthropic"],
  [/^gemini-/, "gemini"],
  [/^gpt-/, "openai"],
  [/^o[134]/, "openai"],
  [/^deepseek-/, "openrouter"],
];

/**
 * Infer provider from model name prefix
 * Used as fallback when no provider prefix or alias is given
 */
function inferProviderFromModelName(modelName) {
  if (!modelName) return "openai";
  const m = modelName.toLowerCase();
  return MODEL_PREFIX_PROVIDERS.find(([re]) => re.test(m))?.[1] || "openai";
}

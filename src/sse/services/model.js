// Re-export from open-sse with localDb integration
import { getModelAliases, getComboByName, getProviderNodes } from "@/lib/localDb";
import { parseModel as parseModelCore, resolveModelAliasFromMap, getModelInfoCore } from "open-sse/services/model.js";
import { getCoreComboMembers } from "open-sse/config/coreModelCombos.js";
import REGISTRY from "open-sse/providers/registry/index.js";

// Local provider alias overrides (HMR-friendly, applied on top of open-sse map)
const LOCAL_PROVIDER_ALIASES = {
  xmtp: "xiaomi-tokenplan",
  "xiaomi-tokenplan": "xiaomi-tokenplan",
};

const RESERVED_PROVIDER_PREFIXES = new Set(Object.keys(LOCAL_PROVIDER_ALIASES));
for (const entry of REGISTRY) {
  RESERVED_PROVIDER_PREFIXES.add(entry.id);
  if (entry.alias) RESERVED_PROVIDER_PREFIXES.add(entry.alias);
  for (const alias of entry.aliases || []) RESERVED_PROVIDER_PREFIXES.add(alias);
}

export function parseModel(modelStr) {
  const parsed = parseModelCore(modelStr);
  if (parsed?.providerAlias && LOCAL_PROVIDER_ALIASES[parsed.providerAlias]) {
    return { ...parsed, provider: LOCAL_PROVIDER_ALIASES[parsed.providerAlias] };
  }
  return parsed;
}

/**
 * Resolve model alias from localDb
 */
export async function resolveModelAlias(alias) {
  const aliases = await getModelAliases();
  return resolveModelAliasFromMap(alias, aliases);
}

/**
 * Get full model info (parse or resolve)
 */
export async function getModelInfo(modelStr) {
  const parsed = parseModel(modelStr);

  // Provider-node prefixes are user-defined. A "prefix/model" string whose
  // prefix is not a built-in id/alias may still belong to a compatible node
  // (e.g. oct/gpt-image-1). Check the node registry before treating it as a
  // model alias — otherwise open-sse infers openai from the gpt- pattern.
  // The prefix before "/" may be either the node's user-defined routing
  // prefix (e.g. "omop/...") or the full node id (e.g. the dashboard model
  // Test button sends "<node-id>/<model>"); match both so the latter does
  // not fall through to the openai inference fallback.
  const slashIdx = typeof modelStr === "string" ? modelStr.indexOf("/") : -1;
  const rawPrefix = slashIdx > 0 ? modelStr.slice(0, slashIdx) : null;
  if (rawPrefix && !RESERVED_PROVIDER_PREFIXES.has(rawPrefix)) {
    const openaiNodes = await getProviderNodes({ type: "openai-compatible" });
    const matchedOpenAI = openaiNodes.find((node) => node.prefix === rawPrefix || node.id === rawPrefix);
    if (matchedOpenAI) {
      return { provider: matchedOpenAI.id, model: modelStr.slice(slashIdx + 1) };
    }
    const anthropicNodes = await getProviderNodes({ type: "anthropic-compatible" });
    const matchedAnthropic = anthropicNodes.find((node) => node.prefix === rawPrefix || node.id === rawPrefix);
    if (matchedAnthropic) {
      return { provider: matchedAnthropic.id, model: modelStr.slice(slashIdx + 1) };
    }
    const embeddingNodes = await getProviderNodes({ type: "custom-embedding" });
    const matchedEmbedding = embeddingNodes.find((node) => node.prefix === rawPrefix || node.id === rawPrefix);
    if (matchedEmbedding) {
      return { provider: matchedEmbedding.id, model: modelStr.slice(slashIdx + 1) };
    }
  }

  if (!parsed.isAlias) {
    return {
      provider: parsed.provider,
      model: parsed.model
    };
  }

  // Check if this is a combo name (or core-model family) before resolving as
  // alias — prevents combo/core names from being incorrectly routed to providers.
  const comboModels = await getComboModels(parsed.model);
  if (comboModels) {
    // Return null provider to signal this should be handled as combo
    // The caller (handleChat) will detect this and handle it as combo
    return { provider: null, model: parsed.model };
  }

  return getModelInfoCore(modelStr, getModelAliases);
}

/**
 * Check if model is a combo and get models list
 * @returns {Promise<string[]|null>} Array of models or null if not a combo
 */
export async function getComboModels(modelStr) {
  const combo = await getComboByName(modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  // Only check core-model fallback if it's not in provider/model format
  if (modelStr.includes("/")) return null;
  // Core-model family: bare canonical model name (e.g. "glm-5.3-flash",
  // "deepseek-v4.1-flash") routes as a virtual combo over provider bindings.
  const coreMembers = getCoreComboMembers(modelStr);
  if (coreMembers && coreMembers.length > 0) {
    return coreMembers;
  }
  return null;
}

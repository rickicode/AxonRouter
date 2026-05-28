// Re-export from open-sse with localDb integration
import { parseModel, resolveModelAliasFromMap, getModelInfoCore } from "../../../open-sse/services/model";
import { AI_PROVIDERS, APIKEY_PROVIDERS, ALIAS_TO_ID, resolveProviderId } from "@/shared/constants/providers";
import { getVirtualSystemModelDefinition, isVirtualSystemModel } from "@/lib/routing/virtualModelResolver";

type LocalDbModule = typeof import("@/lib/localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export { parseModel };

// Providers that are known to the system (real provider IDs, not model prefixes)
const KNOWN_PROVIDER_IDS = new Set([
  ...Object.keys(AI_PROVIDERS || {}),
  ...Object.keys(APIKEY_PROVIDERS || {}),
  ...Object.keys(ALIAS_TO_ID || {}),
  "openai", "anthropic", "gemini", "openrouter", "commandcode",
  "glm", "glm-cn", "kimi", "minimax", "minimax-cn",
  "volcengine-ark", "alicode", "alicode-intl",
]);

/**
 * Resolve model alias from localDb
 */
export async function resolveModelAlias(alias) {
  const { getModelAliases } = await loadLocalDb();
  const aliases = await getModelAliases();
  return resolveModelAliasFromMap(alias, aliases);
}

/**
 * Get full model info (parse or resolve)
 */
export async function getModelInfo(modelStr) {
  if (isVirtualSystemModel(modelStr)) {
    const definition = getVirtualSystemModelDefinition(modelStr);
    return { provider: null, model: definition?.id || modelStr, isVirtualSystemModel: true };
  }

  const parsed = parseModel(modelStr);

  if (!parsed.isAlias) {
    if (parsed.providerAlias) {
      // Always check provider-node prefixes using the original user input.
      // This avoids built-in aliases like `ark` shadowing custom compatible nodes.
      const { getProviderNodes } = await loadLocalDb();
      const openaiNodes = await getProviderNodes({ type: "openai-compatible" });
      const matchedOpenAI = openaiNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedOpenAI) {
        return { provider: matchedOpenAI.id, model: parsed.model };
      }

      const anthropicNodes = await getProviderNodes({ type: "anthropic-compatible" });
      const matchedAnthropic = anthropicNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedAnthropic) {
        return { provider: matchedAnthropic.id, model: parsed.model };
      }
    }

    // Allow full compatible provider IDs directly (e.g. openai-compatible-.../model)
    const isCompatibleProviderId = typeof parsed.provider === "string" && (
      parsed.provider.startsWith("openai-compatible-") ||
      parsed.provider.startsWith("anthropic-compatible-")
    );
    if (isCompatibleProviderId) {
      return {
        provider: parsed.provider,
        model: parsed.model,
      };
    }

    // Provider not recognized — check if alias resolves to a known provider before falling to Command Code
    if (!KNOWN_PROVIDER_IDS.has(parsed.provider)) {
      const resolvedFromAlias = resolveProviderId(parsed.providerAlias || parsed.provider);
      if (resolvedFromAlias !== parsed.provider && KNOWN_PROVIDER_IDS.has(resolvedFromAlias)) {
        return { provider: resolvedFromAlias, model: parsed.model };
      }
      const commandcodeId = resolveProviderId("commandcode") || "commandcode";
      return { provider: commandcodeId, model: modelStr, isCommandCode: true };
    }

    return {
      provider: parsed.provider,
      model: parsed.model
    };
  }

  // Check if this is a combo name before resolving as alias
  const { getComboByName, getModelAliases } = await loadLocalDb();
  const combo = await getComboByName(parsed.model);
  if (combo) {
    return { provider: null, model: parsed.model };
  }

  return getModelInfoCore(modelStr, getModelAliases);
}

/**
 * Resolve combo by direct name or model-combo mapping.
 */
export async function getComboForModel(modelStr) {
  if (isVirtualSystemModel(modelStr)) return null;

  const { getComboByName, resolveComboForModel } = await loadLocalDb();

  let combo = await getComboByName(modelStr);
  if (combo && Array.isArray(combo.models) && combo.models.length > 0) {
    return combo;
  }

  if (typeof modelStr === "string" && modelStr.startsWith("combo/")) {
    const nameToSearch = modelStr.slice("combo/".length);
    combo = await getComboByName(nameToSearch);
    if (combo && Array.isArray(combo.models) && combo.models.length > 0) {
      return combo;
    }
  }

  return resolveComboForModel(modelStr);
}

/**
 * Check if model is a combo and get normalized combo object.
 * @returns {Promise<object|null>}
 */
export async function getComboModels(modelStr) {
  const combo = await getComboForModel(modelStr);
  return combo && Array.isArray(combo.models) && combo.models.length > 0 ? combo : null;
}

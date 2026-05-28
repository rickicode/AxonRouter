import { getCurrentAllSyncedAvailableModels, getCurrentCustomModels } from "@/lib/modelCatalogAccess";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS } from "@/shared/constants/providers";

const providerMaps = [
  OAUTH_PROVIDERS || {},
  FREE_PROVIDERS || {},
  FREE_TIER_PROVIDERS || {},
  APIKEY_PROVIDERS || {},
];

const ALL_PROVIDER_IDS = providerMaps.flatMap((providerMap) => Object.keys(providerMap));

const ALIAS_TO_PROVIDER_ID = Object.fromEntries(
  Object.entries(PROVIDER_ID_TO_ALIAS || {}).map(([providerId, alias]) => [alias, providerId])
);

export function normalizeAggregateModelSource(value, fallback = "custom") {
  const source = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (source === "imported" || source === "system" || source === "custom" || source === "alias") {
    return source;
  }
  return source || fallback;
}

function resolveCustomModelProviderId(providerAlias) {
  if (ALL_PROVIDER_IDS.includes(providerAlias)) return providerAlias;
  return ALIAS_TO_PROVIDER_ID[providerAlias] || providerAlias;
}

function mergeModelLists(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const model of Array.isArray(list) ? list : []) {
      if (!model?.id) continue;
      merged.set(model.id, {
        ...merged.get(model.id),
        ...model,
      });
    }
  }
  return Array.from(merged.values());
}

function getSystemModelsByProvider() {
  return Object.fromEntries(
    ALL_PROVIDER_IDS.map((providerId) => [
      providerId,
      (getModelsByProviderId(providerId) || []).map((model) => ({
        ...model,
        source: normalizeAggregateModelSource(model?.source, "system"),
      })),
    ])
  );
}

export async function getAggregateProviderModelsByProvider() {
  const [customModels, syncedAvailableModels] = await Promise.all([
    getCurrentCustomModels(),
    getCurrentAllSyncedAvailableModels(),
  ]);

  const groupedSystem = getSystemModelsByProvider();
  const groupedCustom = {};
  for (const model of Array.isArray(customModels) ? customModels : []) {
    const providerAlias = typeof model?.providerAlias === "string" ? model.providerAlias : "";
    const providerId = resolveCustomModelProviderId(providerAlias);
    if (!providerId) continue;
    if (!Array.isArray(groupedCustom[providerId])) groupedCustom[providerId] = [];
    groupedCustom[providerId].push({
      ...model,
      source: normalizeAggregateModelSource(model?.source, "custom"),
    });
  }

  const groupedSynced = {};
  for (const [providerId, connectionsMap] of Object.entries(syncedAvailableModels || {})) {
    const merged = new Map();
    for (const models of Object.values(connectionsMap || {})) {
      if (!Array.isArray(models)) continue;
      for (const model of models) {
        if (!model?.id) continue;
        merged.set(model.id, {
          ...merged.get(model.id),
          ...model,
          source: normalizeAggregateModelSource(model?.source, "imported"),
        });
      }
    }
    groupedSynced[providerId] = Array.from(merged.values());
  }

  const allProviderIds = Array.from(new Set([
    ...Object.keys(groupedSystem),
    ...Object.keys(groupedCustom),
    ...Object.keys(groupedSynced),
  ]));

  return Object.fromEntries(
    allProviderIds.map((providerId) => {
      // For providers without modelsFetcher/passthroughModels, always use system models
      // This prevents stale synced data from overriding the correct hardcoded model list
      const providerDef = providerMaps.flatMap(m => Object.values(m)).find((p: any) => p.id === providerId) as any;
      const canSyncModels = providerDef?.passthroughModels || providerDef?.modelsFetcher;
      const base = (canSyncModels && groupedSynced[providerId]?.length)
        ? groupedSynced[providerId]
        : groupedSystem[providerId] || [];
      return [
        providerId,
        mergeModelLists(base, groupedCustom[providerId] || []),
      ];
    })
  );
}

export async function getAggregateProviderModelsForProvider(providerId) {
  const grouped = await getAggregateProviderModelsByProvider();
  return grouped[providerId] || [];
}

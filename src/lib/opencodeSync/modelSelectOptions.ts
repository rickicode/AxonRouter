import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import {
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/shared/constants/providers";

const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(FREE_TIER_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

const NO_AUTH_PROVIDER_IDS = Object.keys(FREE_PROVIDERS).filter((id) => FREE_PROVIDERS[id].noAuth);

type SelectableModel = {
  id: string;
  name?: string;
  value?: string;
  source?: string;
  isPlaceholder?: boolean;
  isCustom?: boolean;
};

type ProviderNode = {
  id?: string;
  name?: string;
  prefix?: string;
};

type ActiveProvider = {
  provider?: string;
  name?: string;
  providerSpecificData?: {
    prefix?: string;
  };
};

type ModelGroup = {
  name: string;
  alias: string;
  color?: string;
  models: SelectableModel[];
  isCustom?: boolean;
  hasModels?: boolean;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function buildGroupedSelectableModels({ activeProviders = [], modelAliases = {}, providerNodes = [], providerModelsByProvider = {} }: any = {}) {
  const groups: Record<string, ModelGroup> = {};
  const allProviders = {
    ...OAUTH_PROVIDERS,
    ...FREE_PROVIDERS,
    ...FREE_TIER_PROVIDERS,
    ...APIKEY_PROVIDERS,
  };

  const activeConnectionIds = activeProviders.map((provider: ActiveProvider) => provider.provider).filter(isNonEmptyString);
  const providerIdsToShow = new Set([...activeConnectionIds, ...NO_AUTH_PROVIDER_IDS]);

  const sortedProviderIds = [...providerIdsToShow].sort((a, b) => {
    const indexA = PROVIDER_ORDER.indexOf(a);
    const indexB = PROVIDER_ORDER.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  sortedProviderIds.forEach((providerId) => {
    const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
    const providerInfo = allProviders[providerId] || { name: providerId, color: "#666" };
    const isCustomProvider = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

    if (providerInfo.passthroughModels) {
      const importedModels = Array.isArray(providerModelsByProvider?.[providerId]) ? providerModelsByProvider[providerId] : [];
      const aliasModels = (Object.entries(modelAliases) as Array<[string, string]>)
        .filter(([, fullModel]) => isNonEmptyString(fullModel) && fullModel.startsWith(`${alias}/`))
        .map(([aliasName, fullModel]): SelectableModel => ({
          id: fullModel.replace(`${alias}/`, ""),
          name: aliasName,
          value: fullModel,
          source: "alias",
        }));

      if (aliasModels.length > 0) {
        const matchedNode = providerNodes.find((node: ProviderNode) => node.id === providerId);
        const displayName = matchedNode?.name || providerInfo.name;

        groups[providerId] = {
          name: displayName,
          alias,
          color: providerInfo.color,
          models: [
            ...importedModels.map((model) => ({ ...model, value: `${alias}/${model.id}`, source: model.source || "imported" })),
            ...aliasModels.filter((model) => !importedModels.some((imported) => imported.id === model.id)),
          ],
        };
      }

      return;
    }

    if (isCustomProvider) {
      const connection = activeProviders.find((provider: ActiveProvider) => provider.provider === providerId);
      const matchedNode = providerNodes.find((node: ProviderNode) => node.id === providerId);
      const displayName = connection?.name || matchedNode?.name || providerInfo.name;
      const nodePrefix = connection?.providerSpecificData?.prefix || matchedNode?.prefix || providerId;
      const importedModels = Array.isArray(providerModelsByProvider?.[providerId]) ? providerModelsByProvider[providerId] : [];

      const nodeModels = (Object.entries(modelAliases) as Array<[string, string]>)
        .filter(([, fullModel]) => isNonEmptyString(fullModel) && fullModel.startsWith(`${providerId}/`))
        .map(([aliasName, fullModel]): SelectableModel => ({
          id: fullModel.replace(`${providerId}/`, ""),
          name: aliasName,
          value: `${nodePrefix}/${fullModel.replace(`${providerId}/`, "")}`,
          source: "alias",
        }));

      const mergedModels = [
        ...importedModels
          .filter((model: SelectableModel) => model?.id && !nodeModels.some((nodeModel) => nodeModel.id === model.id))
          .map((model: SelectableModel) => ({
            id: model.id,
            name: model.name || model.id,
            value: `${nodePrefix}/${model.id}`,
            source: model.source || "imported",
          })),
        ...nodeModels,
      ];

      groups[providerId] = {
        name: displayName,
        alias: nodePrefix,
        color: providerInfo.color,
        models: mergedModels.length > 0
          ? mergedModels
          : [{
              id: `__placeholder__${providerId}`,
              name: `${nodePrefix}/model-id`,
              value: `${nodePrefix}/model-id`,
              isPlaceholder: true,
            }],
        isCustom: true,
        hasModels: mergedModels.length > 0,
      };

      return;
    }

    const hardcodedModels = Array.isArray(providerModelsByProvider?.[providerId])
      ? providerModelsByProvider[providerId]
      : [];
    const hardcodedIds = new Set(hardcodedModels.map((model: SelectableModel) => model.id));
    const hasHardcoded = hardcodedModels.length > 0;

    const customModels = (Object.entries(modelAliases) as Array<[string, string]>)
      .filter(
        ([aliasName, fullModel]) =>
          isNonEmptyString(fullModel) &&
          fullModel.startsWith(`${alias}/`) &&
          (hasHardcoded ? aliasName === fullModel.replace(`${alias}/`, "") : true) &&
          !hardcodedIds.has(fullModel.replace(`${alias}/`, ""))
      )
      .map(([aliasName, fullModel]): SelectableModel => {
        const modelId = fullModel.replace(`${alias}/`, "");
        return { id: modelId, name: aliasName, value: fullModel, isCustom: true, source: "alias" };
      });

    const allModels = [
      ...hardcodedModels.map((model: SelectableModel) => ({ id: model.id, name: model.name || model.id, value: `${alias}/${model.id}`, source: model.source || "system" })),
      ...customModels,
    ];

    if (allModels.length > 0) {
      groups[providerId] = {
        name: providerInfo.name,
        alias,
        color: providerInfo.color,
        models: allModels,
      };
    }
  });

  return groups;
}

export function extractSelectableModelValues(groupedModels: Record<string, ModelGroup> = {}) {
  return Array.from(
    new Set(
      Object.values(groupedModels)
        .flatMap((group) => group.models || [])
        .filter((model): model is SelectableModel & { value: string } => isNonEmptyString(model?.value) && !model.isPlaceholder)
        .map((model) => model.value)
    )
  ).sort((left, right) => left.localeCompare(right));
}

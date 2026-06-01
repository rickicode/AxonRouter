"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getModelsByProviderId, getMorphFastModels } from "@/shared/constants/models";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, getProviderAlias, MORPH_MANAGED_PROVIDER_ID } from "@/shared/constants/providers";
import { filterCodexModelsForConnections } from "@/lib/codexModelAccess";
import { translate } from "@/i18n/runtime";

// Provider order: OAuth first, then Free Tier, then API Key (matches dashboard/providers)
const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(FREE_TIER_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

// Providers that need no auth — always show in model selector
const NO_AUTH_PROVIDER_IDS = Object.keys(FREE_PROVIDERS).filter((id) => (FREE_PROVIDERS as any)[id]?.noAuth);

export default function ModelSelectModal({
  isOpen,
  onClose,
  onSelect,
  selectedModel,
  activeProviders = [],
  title = "Select Model",
  modelAliases = {},
  comboSelectMode = "name",
}: any) {
  const [searchQuery, setSearchQuery] = useState("");
  const [combos, setCombos] = useState<any[]>([]);
  const [providerNodes, setProviderNodes] = useState<any[]>([]);
  const [providerModelsByProvider, setProviderModelsByProvider] = useState<Record<string, any>>({});

  const fetchCombos = async () => {
    try {
      const res = await fetch("/api/combos");
      if (!res.ok) throw new Error(`Failed to fetch combos: ${res.status}`);
      const data = await res.json();
      setCombos(data.combos || []);
    } catch (error) {
      console.error("Error fetching combos:", error);
      setCombos([]);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void Promise.resolve().then(() => {
      fetchCombos();
    });
  }, [isOpen]);

  const fetchProviderNodes = async () => {
    try {
      const res = await fetch("/api/provider-nodes");
      if (!res.ok) throw new Error(`Failed to fetch provider nodes: ${res.status}`);
      const data = await res.json();
      setProviderNodes(data.nodes || []);
    } catch (error) {
      console.error("Error fetching provider nodes:", error);
      setProviderNodes([]);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void Promise.resolve().then(() => {
      fetchProviderNodes();
    });
  }, [isOpen]);

  const fetchProviderModels = async () => {
    try {
      const res = await fetch("/api/provider-models");
      if (!res.ok) throw new Error(`Failed to fetch provider models: ${res.status}`);
      const data = await res.json();
      setProviderModelsByProvider(data.models || {});
    } catch (error) {
      console.error("Error fetching provider models:", error);
      setProviderModelsByProvider({});
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void Promise.resolve().then(() => {
      fetchProviderModels();
    });
  }, [isOpen]);

  const allProviders = useMemo(() => ({ ...OAUTH_PROVIDERS, ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...APIKEY_PROVIDERS }), []);

  const groupedModels = useMemo(() => {
    const groups: Record<string, any> = {};

    // Get all active provider IDs from connections
    const activeConnectionIds = activeProviders.map(p => p.provider);

    // Only show connected providers (including both standard and custom)
    const providerIdsToShow = new Set([
      ...activeConnectionIds,
      ...NO_AUTH_PROVIDER_IDS,
      MORPH_MANAGED_PROVIDER_ID,
    ]);

    // Sort by PROVIDER_ORDER
    const sortedProviderIds = [...providerIdsToShow].sort((a, b) => {
      const indexA = PROVIDER_ORDER.indexOf(a);
      const indexB = PROVIDER_ORDER.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    sortedProviderIds.forEach((providerId) => {
      // Must match the prefix the provider detail page uses when writing modelAliases
      // (getProviderAlias), otherwise custom models for providers with short aliases
      // like deepseek ("ds"), perplexity ("pplx"), etc. would be filtered out.
      const alias = getProviderAlias(providerId);
      const providerInfo: any = (allProviders as any)[providerId] || { name: providerId, color: "#666" };
      const isCustomProvider = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

      if (providerId === MORPH_MANAGED_PROVIDER_ID) {
        const morphModels = getMorphFastModels().map((m: any) => ({
          id: m.id,
          name: m.name,
          value: `morph/${m.id}`,
          premium: Boolean(m.premium),
        }));

        groups[providerId] = {
          name: providerInfo.name || translate("Morph Fast Models"),
          alias: "morph",
          color: providerInfo.color,
          models: morphModels,
        };
        return;
      }

      if (providerInfo.passthroughModels) {
        const mergedHardcodedModels = providerId === "codex"
          ? filterCodexModelsForConnections(activeProviders.filter((p: any) => p.provider === "codex"), providerModelsByProvider?.[providerId] || [])
          : (providerModelsByProvider?.[providerId] || []);
        const hardcodedModels = mergedHardcodedModels;
        const hardcodedIds = new Set((mergedHardcodedModels as any[]).map((m: any) => m.id));
        const aliasModels = Object.entries(modelAliases as Record<string, any>)
          .filter(([, fullModel]) => String(fullModel).startsWith(`${alias}/`))
          .map(([aliasName, fullModel]) => ({
            id: String(fullModel).replace(`${alias}/`, ""),
            name: aliasName,
            value: String(fullModel),
            isCustom: !hardcodedIds.has(String(fullModel).replace(`${alias}/`, "")),
            source: "alias",
          }));

        const modelsById = new Map<string, any>();
        for (const model of (mergedHardcodedModels as any[])) {
          modelsById.set(model.id, {
            id: model.id,
            name: model.name,
            value: `${alias}/${model.id}`,
            premium: Boolean(model.premium),
            source: model.source || "system",
          });
        }
        for (const model of aliasModels) {
          modelsById.set(model.id, model);
        }

        const modelsToShow = Array.from(modelsById.values());
        if (modelsToShow.length > 0) {
          const matchedNode = providerNodes.find((node: any) => node.id === providerId);
          const displayName = matchedNode?.name || providerInfo.name;

          groups[providerId] = {
            name: displayName,
            alias: alias,
            color: providerInfo.color,
            models: modelsToShow,
          };
        }
      } else if (isCustomProvider) {
        const connection = activeProviders.find((p: any) => p.provider === providerId);
        const matchedNode = providerNodes.find((node: any) => node.id === providerId);
        const displayName = connection?.name || matchedNode?.name || providerInfo.name;
        const nodePrefix = connection?.providerSpecificData?.prefix || matchedNode?.prefix || providerId;

        const nodeModels = Object.entries(modelAliases as Record<string, any>)
          .filter(([, fullModel]) => String(fullModel).startsWith(`${providerId}/`))
          .map(([aliasName, fullModel]) => ({
            id: String(fullModel).replace(`${providerId}/`, ""),
            name: aliasName,
            value: `${nodePrefix}/${String(fullModel).replace(`${providerId}/`, "")}`,
          }));

        const modelsToShow = nodeModels.length > 0 ? nodeModels : [{
          id: `__placeholder__${providerId}`,
          name: `${nodePrefix}/model-id`,
          value: `${nodePrefix}/model-id`,
          isPlaceholder: true,
        }];

        groups[providerId] = {
          name: displayName,
          alias: nodePrefix,
          color: providerInfo.color,
          models: modelsToShow,
          isCustom: true,
          hasModels: nodeModels.length > 0,
        };
      } else {
        const mergedHardcodedModels = providerId === MORPH_MANAGED_PROVIDER_ID
          ? getMorphFastModels().map((model: any) => ({ ...model, source: model.source || "system" }))
          : providerId === "codex"
            ? filterCodexModelsForConnections(activeProviders.filter((p: any) => p.provider === "codex"), providerModelsByProvider?.[providerId] || [])
            : (providerModelsByProvider?.[providerId] || []);
        const hardcodedModels = mergedHardcodedModels;
        const hardcodedIds = new Set((mergedHardcodedModels as any[]).map((m: any) => m.id));

        const hasHardcoded = hardcodedModels.length > 0;
        const customModels = Object.entries(modelAliases as Record<string, any>)
          .filter(([aliasName, fullModel]) =>
            String(fullModel).startsWith(`${alias}/`) &&
            (hasHardcoded ? aliasName === String(fullModel).replace(`${alias}/`, "") : true) &&
            !hardcodedIds.has(String(fullModel).replace(`${alias}/`, ""))
          )
          .map(([aliasName, fullModel]) => {
            const modelId = String(fullModel).replace(`${alias}/`, "");
            return { id: modelId, name: aliasName, value: String(fullModel), isCustom: true };
          });

        const allModels = [
          ...(mergedHardcodedModels as any[]).map((m: any) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, premium: Boolean(m.premium), source: m.source || "system" })),
          ...customModels,
        ];

        if (allModels.length > 0) {
          groups[providerId] = {
            name: providerInfo.name,
            alias: alias,
            color: providerInfo.color,
            models: allModels,
          };
        }
      }
    });

    return groups;
  }, [activeProviders, modelAliases, allProviders, providerNodes, providerModelsByProvider]);

  // Filter combos by search query
  const filteredCombos = useMemo(() => {
    if (!searchQuery.trim()) return combos;
    const query = searchQuery.toLowerCase();
    return combos.filter(c => c.name.toLowerCase().includes(query));
  }, [combos, searchQuery]);

  // Filter models by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedModels;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, any> = {};

    Object.entries(groupedModels).forEach(([providerId, group]: [string, any]) => {
      const matchedModels = group.models.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query)
      );

      const providerNameMatches = group.name.toLowerCase().includes(query);

      if (matchedModels.length > 0 || providerNameMatches) {
        filtered[providerId] = {
          ...group,
          models: matchedModels,
        };
      }
    });

    return filtered;
  }, [groupedModels, searchQuery]);

  const handleSelect = (model: any) => {
    onSelect(model);
    onClose();
    setSearchQuery("");
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) return;
        onClose();
        setSearchQuery("");
      }}
    >
      <DialogContent className="max-h-[90vh] w-[min(96vw,860px)] max-w-[860px] overflow-hidden rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)] p-0 shadow-xl">
        <DialogHeader className="border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-[var(--color-text-main)]">{title}</DialogTitle>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {translate("Choose a provider model or combo route for this step.")}
              </p>
            </div>
            <div className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-2 py-1 text-[10px] text-[var(--color-text-muted)]">
              {filteredCombos.length + Object.values(filteredGroups).reduce((sum, group) => sum + group.models.length, 0)} {translate("options")}
            </div>
          </div>
        </DialogHeader>

        <div className="border-b border-[var(--color-border)] px-5 py-3">
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-2">
            <div className="relative">
              <AppIcon
                name="search"
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <Input
                type="text"
                placeholder={translate("Search models, providers, or combos...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 rounded border-[var(--color-border)] bg-[var(--color-surface)] pl-10 text-sm text-[var(--color-text-main)]"
              />
            </div>
          </div>
        </div>

        {/* Models grouped by provider */}
        <div className="max-h-[68vh] overflow-x-hidden overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {/* Combos section - always first */}
            {filteredCombos.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-6 items-center justify-center rounded bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    <AppIcon name="layers" size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-main)]">{translate("Combos")}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">{filteredCombos.length} {translate("available routes")}</div>
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
                  {filteredCombos.map((combo) => {
                    const isSelected = selectedModel === combo.name;
                    return (
                      <button
                        key={combo.id}
                        onClick={() => handleSelect({ id: combo.name, name: combo.name, value: comboSelectMode === "ref" ? `ref:${combo.name}` : combo.name })}
                        className={
                          `group min-w-0 rounded border px-3 py-2 text-left transition-colors hover:cursor-pointer ` +
                          (isSelected
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-text-main)]"
                            : "border-[var(--color-border)] bg-[var(--color-bg-alt)] text-[var(--color-text-main)] hover:border-[var(--color-primary)]")
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{combo.name}</div>
                            <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                              {translate("Combo route")}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <span className="rounded bg-black/5 px-2 py-0.5 text-[10px] uppercase text-[var(--color-text-muted)] dark:bg-white/5">
                                {translate("route")}
                              </span>
                              {isSelected ? <span className="rounded bg-pink-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--color-primary)]">selected</span> : null}
                            </div>
                          </div>
                          <AppIcon name="east" size={16} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Provider models */}
            {Object.entries(filteredGroups).map(([providerId, group]) => (
              <section key={providerId} className="space-y-2">
                <div className="flex items-center gap-3">
                  <div
                    className="size-3 rounded"
                    style={{ backgroundColor: group.color }}
                  />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-main)]">{group.name}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">{group.models.length} {translate("models")}</div>
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
                  {group.models.map((model) => {
                    const isSelected = selectedModel === model.value;
                    const isPlaceholder = model.isPlaceholder;
                    return (
                      <button
                        key={model.id}
                        onClick={() => handleSelect(model)}
                        title={isPlaceholder ? translate("Select to pre-fill, then edit model ID in the input") : undefined}
                        className={
                          `group min-w-0 rounded border px-3 py-2 text-left transition-colors hover:cursor-pointer ` +
                          (isPlaceholder
                            ? "border-dashed border-[var(--color-border)] bg-[var(--color-bg-alt)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                            : isSelected
                              ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-text-main)]"
                              : "border-[var(--color-border)] bg-[var(--color-bg-alt)] text-[var(--color-text-main)] hover:border-[var(--color-primary)]")
                        }
                      >
                        {isPlaceholder ? (
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 shrink-0 rounded bg-black/5 p-1.5 text-[var(--color-text-muted)] dark:bg-white/5">
                              <AppIcon name="edit" size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{model.name}</div>
                              <div className="mt-1 text-xs opacity-80">{translate("Pre-fill and edit manually")}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{model.name}</div>
                            <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                              {model.value || `${group.alias}/${model.id}`}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {model.premium && (
                                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-600 dark:text-amber-400">
                                  {translate("premium")}
                                </span>
                              )}
                              {model.source && (
                                <span className="rounded bg-black/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)] dark:bg-white/5">
                                  {translate(model.source)}
                                </span>
                              )}
                              {model.isCustom && (
                                <span className="rounded bg-black/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)] dark:bg-white/5">
                                  {translate("custom")}
                                </span>
                              )}
                              {isSelected ? <span className="rounded bg-pink-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--color-primary)]">selected</span> : null}
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            {Object.keys(filteredGroups).length === 0 && filteredCombos.length === 0 && (
              <div className="rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg-alt)] py-8 text-center text-[var(--color-text-muted)]">
                <AppIcon name="search_off" size={28} className="mx-auto mb-2 block" />
                <p className="text-sm font-medium text-[var(--color-text-main)]">{translate("No models found")}</p>
                <p className="mt-1 text-xs">{translate("Try a different provider name, combo name, or model keyword.")}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

ModelSelectModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  selectedModel: PropTypes.string,
  activeProviders: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
    })
  ),
  title: PropTypes.string,
  modelAliases: PropTypes.object,
  comboSelectMode: PropTypes.oneOf(["name", "ref"]),
};

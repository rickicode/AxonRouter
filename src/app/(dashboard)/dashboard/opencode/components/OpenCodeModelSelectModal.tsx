"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildGroupedSelectableModels } from "@/lib/opencodeSync/modelSelectOptions";

function buildComboKey(combo, index) {
  const idPart = typeof combo?.id === "string" && combo.id ? combo.id : JSON.stringify(combo?.id ?? combo?.name ?? index);
  return `combo:${idPart}:${combo?.name || index}`;
}

function buildModelKey(providerId, model, index) {
  return `provider:${providerId}:${model?.value || model?.id || model?.name || index}:${index}`;
}

export default function OpenCodeModelSelectModal({
  isOpen,
  onClose,
  onSelect,
  selectedModel,
  selectedModels,
  activeProviders = [],
  title = "Select Model",
  modelAliases = {},
  multiSelect = false,
  confirmLabel,
  enabledModels,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [combos, setCombos] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [providerModelsByProvider, setProviderModelsByProvider] = useState({});

  const normalizedSelectedModels = useMemo(() => {
    if (Array.isArray(selectedModels)) return selectedModels.filter(Boolean);
    if (selectedModel) return [selectedModel];
    return [];
  }, [selectedModel, selectedModels]);

  const [pendingSelection, setPendingSelection] = useState(() => normalizedSelectedModels);

  const enabledModelSet = useMemo(() => {
    if (!Array.isArray(enabledModels) || enabledModels.length === 0) return null;
    return new Set(enabledModels.filter(Boolean));
  }, [enabledModels]);

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;

    async function loadPickerData() {
      try {
        const [combosRes, providerNodesRes, providerModelsRes] = await Promise.all([
          fetch("/api/combos"),
          fetch("/api/provider-nodes"),
          fetch("/api/provider-models"),
        ]);

        const [combosData, providerNodesData, providerModelsData] = await Promise.all([
          combosRes.ok ? combosRes.json() : Promise.resolve({ combos: [] }),
          providerNodesRes.ok ? providerNodesRes.json() : Promise.resolve({ nodes: [] }),
          providerModelsRes.ok ? providerModelsRes.json() : Promise.resolve({ models: {} }),
        ]);

        if (cancelled) return;

        setCombos(Array.isArray(combosData?.combos) ? combosData.combos : []);
        setProviderNodes(Array.isArray(providerNodesData?.nodes) ? providerNodesData.nodes : []);
        setProviderModelsByProvider(providerModelsData?.models || {});
      } catch {
        if (cancelled) return;
        setCombos([]);
        setProviderNodes([]);
        setProviderModelsByProvider({});
      }
    }

    void loadPickerData();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const groupedModels = useMemo(() => {
    return buildGroupedSelectableModels({ activeProviders, modelAliases, providerNodes, providerModelsByProvider });
  }, [activeProviders, modelAliases, providerNodes, providerModelsByProvider]);

  const filteredCombos = useMemo(() => {
    if (!searchQuery.trim()) return combos;
    const query = searchQuery.toLowerCase();
    return combos.filter((combo) => String(combo?.name || "").toLowerCase().includes(query));
  }, [combos, searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedModels;

    const query = searchQuery.toLowerCase();
    const filtered: any = {};

    Object.entries(groupedModels).forEach(([providerId, rawGroup]) => {
      const group: any = rawGroup;
      const matchedModels = (group.models || []).filter((model) => {
        const name = String(model?.name || "").toLowerCase();
        const id = String(model?.id || "").toLowerCase();
        const value = String(model?.value || "").toLowerCase();
        return name.includes(query) || id.includes(query) || value.includes(query);
      });

      const providerNameMatches = String(group?.name || "").toLowerCase().includes(query);

      if (matchedModels.length > 0 || providerNameMatches) {
        filtered[providerId] = {
          ...group,
          models: matchedModels,
        };
      }
    });

    return filtered;
  }, [groupedModels, searchQuery]);

  const handleClose = () => {
    onClose();
    setSearchQuery("");
    setPendingSelection([]);
  };

  const handleSelect = (model) => {
    const nextValue = model?.value;
    if (!nextValue || (enabledModelSet && !enabledModelSet.has(nextValue))) return;

    if (multiSelect) {
      setPendingSelection((current) => (
        current.includes(nextValue) ? current.filter((value) => value !== nextValue) : [...current, nextValue]
      ));
      return;
    }

    onSelect(model);
    handleClose();
  };

  const handleConfirm = () => {
    if (!multiSelect || pendingSelection.length === 0) return;
    onSelect(
      pendingSelection.map((value) => ({
        id: value,
        name: value,
        value,
      }))
    );
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-6xl border-[rgba(15,0,0,0.12)] bg-[#201d1d] font-['Berkeley_Mono']">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
      <div className="mb-3">
        <div className="relative">
          <AppIcon name="search" size={16} className="absolute left-[12px] top-1/2 -translate-y-1/2 text-[#9a9898]" />
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="bg-[#f8f7f7] py-[16px] pl-[36px] pr-3 text-[16px] text-[#201d1d] font-['Berkeley_Mono']"
          />
        </div>
      </div>

      <div className="max-h-[520px] space-y-4 overflow-y-auto custom-scrollbar pr-1">
        {filteredCombos.length > 0 ? (
          <div>
            <div className="sticky top-0 mb-1.5 flex items-center gap-1.5 bg-[#201d1d] py-0.5">
              <AppIcon name="layers" size={16} className="text-[#ec4899]" />
              <span className="text-[16px] font-bold text-[#fdfcfc]">Combos</span>
              <span className="text-[14px] text-[#9a9898]">({filteredCombos.length})</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {filteredCombos.map((combo, index) => {
                const comboName = String(combo?.name || "");
                const isSelected = multiSelect ? pendingSelection.includes(comboName) : selectedModel === comboName;
                const isDisabled = enabledModelSet ? !enabledModelSet.has(comboName) : false;
                const comboStrategy = String(combo?.strategy || "priority");

                return (
                  <button
                    key={buildComboKey(combo, index)}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelect({ id: comboName, name: comboName, value: comboName })}
                    className={[
                      "rounded border px-2 py-1 text-[16px] font-medium transition-all cursor-pointer font-['Berkeley_Mono']",
                      isDisabled
                        ? "cursor-not-allowed border-[rgba(15,0,0,0.12)] bg-[#201d1d] text-[#9a9898] opacity-50"
                        : isSelected
                          ? "border-[#ec4899] bg-[#ec4899] text-[#fdfcfc]"
                          : "border-[rgba(15,0,0,0.12)] bg-[#302c2c] text-[#fdfcfc] hover:border-[#ec4899]/50 hover:text-[#ec4899]",
                    ].join(" ")}
                  >
                    <span className="block truncate">{comboName}</span>
                    <span className="mt-0.5 block text-[10px] opacity-70">{comboStrategy}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {Object.entries(filteredGroups).map(([providerId, rawGroup]) => {
          const group: any = rawGroup;
          return (
          <div key={`group:${providerId}`} className="mt-4 first:mt-0">
            <div className="sticky top-0 mb-1.5 flex items-center gap-1.5 bg-[#201d1d] py-0.5">
              <AppIcon name="memory" size={16} className="text-[#ec4899]" />
              <span className="text-[16px] font-bold text-[#fdfcfc]">{group.name || providerId}</span>
              <span className="text-[14px] text-[#9a9898]">({group.models?.length || 0})</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {(group.models || []).map((model, index) => {
                const isSelected = multiSelect ? pendingSelection.includes(model.value) : selectedModel === model.value;
                const isPlaceholder = model.isPlaceholder;
                const isDisabled = enabledModelSet ? !enabledModelSet.has(model.value) : false;

                return (
                  <button
                    key={buildModelKey(providerId, model, index)}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelect(model)}
                    title={isPlaceholder ? "Select to pre-fill, then edit model ID in the input" : undefined}
                    className={[
                      "rounded border px-2 py-1 text-[16px] font-medium transition-all cursor-pointer font-['Berkeley_Mono']",
                      isDisabled
                        ? "cursor-not-allowed border-[rgba(15,0,0,0.12)] bg-[#201d1d] text-[#9a9898] opacity-50"
                        : isPlaceholder
                        ? "border-[rgba(15,0,0,0.12)] bg-[#302c2c] italic text-[#9a9898] hover:border-[#ec4899]/50 hover:text-[#ec4899] border-dashed"
                        : isSelected
                          ? "border-[#ec4899] bg-[#ec4899] text-[#fdfcfc]"
                          : "border-[rgba(15,0,0,0.12)] bg-[#302c2c] text-[#fdfcfc] hover:border-[#ec4899]/50 hover:text-[#ec4899]",
                    ].join(" ")}
                  >
                    {isPlaceholder ? (
                      <span className="flex items-center gap-1">
                        <AppIcon name="edit" size={14} />
                        {model.name}
                      </span>
                    ) : model.isCustom ? (
                      <span className="flex items-center gap-1">
                        {model.name}
                        <span className="text-[12px] font-normal opacity-60">custom</span>
                      </span>
                    ) : (
                      model.name
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}

        {Object.keys(filteredGroups).length === 0 && filteredCombos.length === 0 ? (
          <div className="py-4 text-center text-[#9a9898] font-['Berkeley_Mono']">
            <AppIcon name="search_off" size={24} className="mb-1 block mx-auto" />
            <p className="text-[16px]">No models found</p>
          </div>
        ) : null}
      </div>
        {multiSelect ? (
          <DialogFooter className="border-t border-[rgba(15,0,0,0.12)] pt-4">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={pendingSelection.length === 0}>
              {confirmLabel || `Add ${pendingSelection.length} model${pendingSelection.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

OpenCodeModelSelectModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  selectedModel: PropTypes.string,
  selectedModels: PropTypes.arrayOf(PropTypes.string),
  activeProviders: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
    })
  ),
  title: PropTypes.string,
  modelAliases: PropTypes.object,
  multiSelect: PropTypes.bool,
  confirmLabel: PropTypes.string,
  enabledModels: PropTypes.arrayOf(PropTypes.string),
};

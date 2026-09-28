"use client";

import { useState, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
import Link from "@/lib/ui/link.jsx";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { ModelSelectModal, CapacityBadges, Button, Input, Toggle } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import Icon from "@/shared/components/Icon";
import {
  JEV_MODEL_CHOICES,
  JEV_PROVIDERS,
  DEFAULT_JEV_MODEL,
} from "open-sse/config/jevModels.js";

const TIER_CONFIG = [
  {
    key: "easy",
    label: "Easy Tier",
    shortLabel: "Easy",
    icon: "bolt",
    borderClass: "border-emerald-500/30",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    headerBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    bgClass: "bg-emerald-500/[0.02]",
    title: "Fast & Economical",
    subtitle: "Short prompts, quick Q&A, lightweight edits, minimal token cost",
  },
  {
    key: "hard",
    label: "Hard Tier",
    shortLabel: "Hard",
    icon: "diamond",
    borderClass: "border-rose-500/30",
    badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    headerBg: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    bgClass: "bg-rose-500/[0.02]",
    title: "Frontier Reasoning",
    subtitle: "Complex architecture, deep reasoning, large context, coding & tool calling",
  },
];

const ROUTING_POLICIES = [
  {
    key: "balanced",
    label: "Balanced",
    icon: "balance",
    desc: "Evaluates prompt complexity, balancing latency, quality, and cost.",
  },
  {
    key: "cost_efficient",
    label: "Cost Efficient",
    icon: "savings",
    desc: "Aggressively routes to Easy tier. Escalates to Hard only when strictly required.",
  },
  {
    key: "capability_heavy",
    label: "Frontier First",
    icon: "psychology",
    desc: "Biases toward Hard tier for maximum reasoning capability.",
  },
];

const JUDGE_MODES = [
  {
    value: "two-layer",
    label: "Two-Layer (Jev + LLM)",
    shortLabel: "Two-Layer",
    badgeClass: "bg-primary/10 text-primary border-primary/30",
    icon: "layers",
    description: "Fast Jev classification (<50ms). Escalates to LLM judge if below confidence threshold.",
  },
  {
    value: "jev-only",
    label: "Jev Only (<50ms)",
    shortLabel: "Jev Only",
    badgeClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    icon: "bolt",
    description: "Ultra-low latency pure classifier. Zero judge token consumption.",
  },
  {
    value: "llm-only",
    label: "LLM Only",
    shortLabel: "LLM Only",
    badgeClass: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    icon: "smart_toy",
    description: "Direct LLM judge prompt evaluation without calling TypeSafe Jev.",
  },
];

// Sortable item component inside tier cards
function SortableTierModelRow({
  id,
  model,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
  getCaps,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 transition-all ${
        isDragging ? "border-primary shadow-lg ring-1 ring-primary" : "hover:border-border/80"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab touch-none size-6 rounded flex items-center justify-center text-text-muted hover:text-primary hover:bg-surface-2 active:cursor-grabbing shrink-0 transition-colors"
          title="Drag to reorder priority"
          aria-label="Drag to reorder priority"
        >
          <Icon name="drag_indicator" size={15} />
        </button>

        {/* Priority Rank */}
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold bg-surface-2 text-text-muted border border-border/40"
          title={`Priority #${index + 1}: Attempted first in this tier, fails over sequentially`}
        >
          #{index + 1}
        </span>

        {/* Model ID */}
        <span className="truncate font-mono text-xs font-medium text-text-main" title={model}>
          {model}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <CapacityBadges caps={getCaps?.(model)} />

        {/* Move up / down buttons for fast 1-click reordering */}
        <div className="flex items-center border-l border-border/50 pl-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            className="size-6 rounded flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface-2 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
            title="Move up in priority"
            aria-label="Move up in priority"
          >
            <Icon name="arrow_upward" size={13} />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="size-6 rounded flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface-2 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
            title="Move down in priority"
            aria-label="Move down in priority"
          >
            <Icon name="arrow_downward" size={13} />
          </button>
        </div>

        {/* Remove Button */}
        <button
          type="button"
          onClick={onRemove}
          className="size-6 rounded flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          title="Remove from tier"
          aria-label="Remove from tier"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}

SortableTierModelRow.propTypes = {
  id: PropTypes.string.isRequired,
  model: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  onMoveUp: PropTypes.func.isRequired,
  onMoveDown: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  getCaps: PropTypes.func,
};

export default function SmartRoutingSection({
  combo,
  strategy = {},
  onSetStrategy,
  onUpdateComboModels,
  activeProviders = [],
  getCaps,
}) {
  const [showJudgeSelect, setShowJudgeSelect] = useState(false);
  const [activeTierPicker, setActiveTierPicker] = useState(null); // "easy" | "hard" | null
  const [quickInputTier, setQuickInputTier] = useState({ easy: "", hard: "" });
  const [showAdvancedClassifier, setShowAdvancedClassifier] = useState(false);
  const notify = useNotificationStore();

  const judge = strategy.judgeModel || "";
  const policy = strategy.difficultyPolicy || "balanced";

  // Global judge settings
  const [globalJudge, setGlobalJudge] = useState(null);
  const [globalJudgeError, setGlobalJudgeError] = useState("");
  const [judgeSaving, setJudgeSaving] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState(null);
  const [keyDraft, setKeyDraft] = useState(null);

  const comboOverrideActive =
    strategy.judgeMode != null ||
    strategy.jevConfidenceThreshold != null ||
    strategy.jevModel != null ||
    strategy.jevProvider != null;

  const globalMode = globalJudge?.judgeMode || "two-layer";
  const globalThreshold =
    typeof globalJudge?.jevConfidenceThreshold === "number" ? globalJudge.jevConfidenceThreshold : 0.7;

  const judgeMode =
    comboOverrideActive && strategy.judgeMode != null ? strategy.judgeMode : globalMode;
  const threshold =
    comboOverrideActive && typeof strategy.jevConfidenceThreshold === "number"
      ? strategy.jevConfidenceThreshold
      : globalThreshold;

  // Classifier upstream selection: the picker value is "<providerId>|<modelId>" so
  // two providers serving the same model id (oc/ and ocz/ both serve jev-1.13-free)
  // stay distinguishable. Both halves persist in the strategy.
  const globalJevModel = globalJudge?.jevModel || DEFAULT_JEV_MODEL;
  const globalJevProvider = globalJudge?.jevProvider || "";
  const jevModel =
    comboOverrideActive && strategy.jevModel != null ? strategy.jevModel : globalJevModel;
  const jevProvider =
    comboOverrideActive && strategy.jevProvider != null ? strategy.jevProvider : globalJevProvider;
  const activeJevChoice =
    JEV_MODEL_CHOICES.find((c) => c.value === jevModel && (!jevProvider || c.provider === jevProvider))
    || JEV_MODEL_CHOICES.find((c) => c.value === jevModel)
    || JEV_MODEL_CHOICES[0]
    || null;
  const selectedProviderId = jevProvider || activeJevChoice?.provider || "";
  const selectedProvider = JEV_PROVIDERS.find((p) => p.provider === selectedProviderId) || null;
  const jevEndpoint = activeJevChoice?.endpoint || selectedProvider?.endpoint || "";

  // Per-provider credentials: combo override map when overridden, else the global map.
  const providerKeys =
    comboOverrideActive && strategy.jevApiKeys
      ? strategy.jevApiKeys
      : (globalJudge?.jevApiKeys || {});
  const providerKeyConfigured = (providerId) =>
    Boolean(providerKeys?.[providerId]) ||
    (globalJudge?.jevApiKeysConfigured || []).includes(providerId);
  const providerKeyValue = (providerId) => providerKeys?.[providerId] || "";

  // Live availability per registered classifier provider.
  const providerStatus = (provider) => {
    const conns = activeProviders.filter(
      (p) => p.provider === provider.provider && p.isActive !== false
    ).length;
    if (!provider.keyPool) return { kind: "keyless", count: 0 };
    if (conns > 0) return { kind: "pool", count: conns };
    if (providerKeyConfigured(provider.provider)) return { kind: "key", count: 0 };
    return { kind: "missing", count: 0 };
  };

  const activeJudgeMode = JUDGE_MODES.find((m) => m.value === judgeMode) || JUDGE_MODES[0];
  const thresholdApplies = judgeMode !== "llm-only";
  const shownThreshold = thresholdDraft ?? threshold;

  const loadGlobalJudge = async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load judge settings");
      setGlobalJudge({
        judgeMode: data.judgeMode || "two-layer",
        jevConfidenceThreshold:
          typeof data.jevConfidenceThreshold === "number" ? data.jevConfidenceThreshold : 0.7,
        jevModel: data.jevModel || DEFAULT_JEV_MODEL,
        jevProvider: data.jevProvider || "",
        jevApiKeys: {},
        jevApiKeysConfigured: Array.isArray(data.jevApiKeysConfigured) ? data.jevApiKeysConfigured : [],
      });
      setGlobalJudgeError("");
    } catch (error) {
      setGlobalJudgeError(error?.message || "Global judge settings unavailable");
    }
  };

  useEffect(() => {
    loadGlobalJudge();
  }, []);

  const saveGlobalJudge = async (patch) => {
    setJudgeSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save judge settings");
      await loadGlobalJudge();
      notify.success("Saved global classifier settings");
    } catch (error) {
      notify.error(error?.message || "Failed to save classifier settings");
    } finally {
      setJudgeSaving(false);
    }
  };

  const handleJudgeModeChange = (value) => {
    if (comboOverrideActive) onSetStrategy({ judgeMode: value });
    else saveGlobalJudge({ judgeMode: value });
  };

  const handleJevModelChange = (value) => {
    const choice = JEV_MODEL_CHOICES.find((c) => `${c.provider}|${c.value}` === value) || JEV_MODEL_CHOICES[0];
    if (!choice) return;
    if (comboOverrideActive) {
      onSetStrategy({ jevModel: choice.value, jevProvider: choice.provider, jevEndpoint: choice.endpoint });
    } else {
      saveGlobalJudge({ jevModel: choice.value, jevProvider: choice.provider });
    }
  };

  const handleProviderKeyChange = (providerId) => {
    const draft = keyDraft?.[providerId];
    if (draft === undefined) return;
    const map = { ...(providerKeys || {}), [providerId]: draft };
    if (comboOverrideActive) onSetStrategy({ jevApiKeys: map });
    else saveGlobalJudge({ jevApiKeys: map });
  };

  const handleThresholdRelease = () => {
    if (thresholdDraft === null) return;
    const num = Number(thresholdDraft);
    setThresholdDraft(null);
    if (!Number.isFinite(num) || num === threshold) return;
    const next = Math.min(1, Math.max(0, num));
    if (comboOverrideActive) onSetStrategy({ jevConfidenceThreshold: next });
    else saveGlobalJudge({ jevConfidenceThreshold: next });
  };

  const handleToggleComboOverride = (checked) => {
    const comboName = combo?.name || "this combo";
    if (checked) {
      onSetStrategy({
        judgeMode,
        jevConfidenceThreshold: threshold,
        jevModel,
        jevProvider: selectedProviderId || undefined,
        jevEndpoint,
        ...(Object.keys(providerKeys || {}).length ? { jevApiKeys: providerKeys } : {}),
      });
      notify.success(`Classifier settings overridden for "${comboName}"`);
    } else {
      onSetStrategy({
        judgeMode: undefined,
        jevConfidenceThreshold: undefined,
        jevModel: undefined,
        jevProvider: undefined,
        jevEndpoint: undefined,
        jevApiKeys: undefined,
      });
      notify.success(`Classifier settings now inherit global defaults for "${comboName}"`);
    }
  };

  const easyModels = useMemo(
    () => (Array.isArray(strategy.easyModels) ? strategy.easyModels : []),
    [strategy.easyModels]
  );
  const hardModels = useMemo(
    () => (Array.isArray(strategy.hardModels) ? strategy.hardModels : []),
    [strategy.hardModels]
  );

  const allTiersEmpty = easyModels.length === 0 && hardModels.length === 0;

  const syncComboModels = (newEasy, newHard) => {
    if (!onUpdateComboModels) return;
    const combined = Array.from(new Set([...newEasy, ...newHard].filter(Boolean)));
    onUpdateComboModels(combined);
  };

  const handleAddModelsToTier = (tierKey, modelsToAdd) => {
    const current = tierKey === "easy" ? easyModels : hardModels;
    const next = [...current];
    for (const m of modelsToAdd) {
      if (m && !next.includes(m)) next.push(m);
    }
    const other = tierKey === "easy" ? hardModels : easyModels;
    onSetStrategy({ [`${tierKey}Models`]: next });
    syncComboModels(tierKey === "easy" ? next : other, tierKey === "easy" ? other : next);
  };

  const handleRemoveModelFromTier = (tierKey, modelToRemove) => {
    const current = tierKey === "easy" ? easyModels : hardModels;
    const next = current.filter((m) => m !== modelToRemove);
    const other = tierKey === "easy" ? hardModels : easyModels;
    onSetStrategy({ [`${tierKey}Models`]: next });
    syncComboModels(tierKey === "easy" ? next : other, tierKey === "easy" ? other : next);
  };

  const handleMoveModel = (tierKey, index, direction) => {
    const current = tierKey === "easy" ? easyModels : hardModels;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    const next = arrayMove(current, index, targetIndex);
    const other = tierKey === "easy" ? hardModels : easyModels;
    onSetStrategy({ [`${tierKey}Models`]: next });
    syncComboModels(tierKey === "easy" ? next : other, tierKey === "easy" ? other : next);
  };

  const handleDragEnd = (tierKey, event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = tierKey === "easy" ? easyModels : hardModels;
    const oldIndex = current.indexOf(active.id);
    const newIndex = current.indexOf(over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      const next = arrayMove(current, oldIndex, newIndex);
      const other = tierKey === "easy" ? hardModels : easyModels;
      onSetStrategy({ [`${tierKey}Models`]: next });
      syncComboModels(tierKey === "easy" ? next : other, tierKey === "easy" ? other : next);
    }
  };

  const handleQuickAdd = (tierKey) => {
    const val = quickInputTier[tierKey]?.trim();
    if (!val) return;
    const parts = val.split(/[,\n\s]+/).map((s) => s.trim()).filter(Boolean);
    handleAddModelsToTier(tierKey, parts);
    setQuickInputTier((prev) => ({ ...prev, [tierKey]: "" }));
  };

  const handleAutoDistribute = () => {
    const models = Array.isArray(combo?.models) ? combo.models : [];
    if (models.length === 0) return;

    const easy = [];
    const hard = [];

    if (models.length === 1) {
      easy.push(models[0]);
    } else {
      const half = Math.ceil(models.length / 2);
      easy.push(...models.slice(0, half));
      hard.push(...models.slice(half));
    }

    onSetStrategy({
      easyModels: easy,
      hardModels: hard,
    });
    syncComboModels(easy, hard);
    notify.success(`Auto-distributed ${models.length} models across Easy & Hard tiers`);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <div className="mt-3 flex flex-col gap-3.5 rounded-lg border border-border bg-surface-2 p-3 sm:p-4">
      {/* 1. Header Control Bar: Routing Policy Chips + Judge Model */}
      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Routing Policy Segmented Control */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-xs font-semibold text-text-main shrink-0 flex items-center gap-1.5">
            <Icon name="tune" size={16} className="text-primary" />
            <span>Policy:</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {ROUTING_POLICIES.map((p) => {
              const active = policy === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onSetStrategy({ difficultyPolicy: p.key })}
                  title={p.desc}
                  className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-all ${
                    active
                      ? "bg-primary text-white shadow-xs font-semibold"
                      : "bg-surface-2 border border-border text-text-muted hover:border-border/80 hover:text-text-main"
                  }`}
                >
                  <Icon name={p.icon} size={14} />
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Judge Model Selector */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 lg:border-t-0 lg:pt-0">
          <span className="text-xs font-medium text-text-muted shrink-0">Judge:</span>
          <button
            type="button"
            onClick={() => setShowJudgeSelect(true)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-primary/30 bg-primary/10 px-2.5 h-7 font-mono text-xs font-medium text-primary hover:border-primary hover:bg-primary/15 transition-all"
            title="Click to select custom judge model"
          >
            <Icon name="gavel" size={15} />
            <span className="truncate">{judge || "Auto (First in Combo)"}</span>
            {judge ? <CapacityBadges caps={getCaps?.(judge)} /> : null}
          </button>
          {judge ? (
            <button
              type="button"
              onClick={() => onSetStrategy({ judgeModel: "" })}
              className="inline-flex items-center gap-1 rounded-sm px-1.5 h-7 text-xs text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
              title="Reset to Auto"
            >
              <Icon name="restart_alt" size={15} />
              <span>Reset</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Auto-distribute Banner when both tiers are empty */}
      {allTiersEmpty && combo?.models && combo.models.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Icon className="text-primary shrink-0 mt-0.5" name="auto_fix_high" size={18} />
            <div>
              <p className="font-semibold text-text-main">Distribute existing models into tiers</p>
              <p className="text-[11px] text-text-muted">
                This combo has {combo.models.length} model(s). Auto-distribute them into Easy and Hard tiers?
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            icon="bolt"
            onClick={handleAutoDistribute}
            className="shrink-0"
          >
            Auto-Distribute
          </Button>
        </div>
      )}

      {/* 2. Side-by-Side 2-Tier Cards (Easy & Hard) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-stretch">
        {TIER_CONFIG.map((tier) => {
          const tierModels = tier.key === "easy" ? easyModels : hardModels;
          const quickInput = quickInputTier[tier.key];

          return (
            <div
              key={tier.key}
              className={`flex flex-col justify-between rounded-lg border ${tier.borderClass} ${tier.bgClass} p-3.5 shadow-xs`}
            >
              <div>
                {/* Tier Card Header */}
                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`flex size-7 shrink-0 items-center justify-center rounded-md border ${tier.headerBg}`}>
                      <Icon name={tier.icon} size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-text-main">{tier.label}</span>
                        <span className="rounded-full bg-surface-3 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-text-muted border border-border">
                          {tierModels.length}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted truncate" title={tier.subtitle}>
                        {tier.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Add Model Button */}
                  <Button
                    size="xs"
                    variant="secondary"
                    icon="add"
                    onClick={() => setActiveTierPicker(tier.key)}
                    className="shrink-0"
                  >
                    Add Model
                  </Button>
                </div>

                {/* Inline Quick Add Input */}
                <div className="mt-2.5 flex items-center gap-1.5">
                  <Input
                    placeholder="Type model ID and press Enter..."
                    value={quickInput}
                    onChange={(e) =>
                      setQuickInputTier((prev) => ({ ...prev, [tier.key]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleQuickAdd(tier.key);
                      }
                    }}
                    className="text-xs font-mono w-full"
                    inputClassName="h-7 text-xs font-mono py-1"
                  />
                  <Button
                    size="xs"
                    variant="ghost"
                    icon="add"
                    disabled={!quickInput.trim()}
                    onClick={() => handleQuickAdd(tier.key)}
                    className="shrink-0"
                  >
                    Add
                  </Button>
                </div>

                {/* Tier Model List (Sortable via dnd-kit & Up/Down arrows) */}
                <div className="mt-2.5 flex flex-col gap-1.5 max-h-[340px] overflow-y-auto pr-0.5">
                  {tierModels.length === 0 ? (
                    <div className="py-7 text-center border border-dashed border-border/80 rounded-md bg-surface/50">
                      <div className="flex flex-col items-center justify-center gap-1.5 max-w-xs mx-auto">
                        <Icon className="text-text-muted/60" name={tier.icon} size={20} />
                        <span className="font-medium text-text-muted text-xs">No models in {tier.shortLabel} tier</span>
                        <Button
                          size="xs"
                          variant="ghost"
                          icon="add"
                          onClick={() => setActiveTierPicker(tier.key)}
                          className="mt-1"
                        >
                          Browse &amp; Add Models
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEnd(tier.key, e)}
                      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    >
                      <SortableContext items={tierModels} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col gap-1.5">
                          {tierModels.map((model, idx) => (
                            <SortableTierModelRow
                              key={model}
                              id={model}
                              model={model}
                              index={idx}
                              total={tierModels.length}
                              onMoveUp={() => handleMoveModel(tier.key, idx, -1)}
                              onMoveDown={() => handleMoveModel(tier.key, idx, 1)}
                              onRemove={() => handleRemoveModelFromTier(tier.key, model)}
                              getCaps={getCaps}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </div>

              {/* Bottom helper */}
              {tierModels.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-text-muted">
                  <span>Priority #1 attempted first, subsequent models serve as failovers</span>
                  <button
                    type="button"
                    onClick={() => setActiveTierPicker(tier.key)}
                    className="text-primary hover:underline font-medium"
                  >
                    + Add more
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. Classifier & System One Settings (Compact Accordion) */}
      <div className="rounded-md border border-border bg-surface overflow-hidden">
        {/* Collapsed Bar / Summary Header */}
        <div
          onClick={() => setShowAdvancedClassifier(!showAdvancedClassifier)}
          className="flex flex-wrap items-center justify-between gap-2.5 p-3 cursor-pointer hover:bg-surface-2/60 transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Icon name="psychology" size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-text-main">Jev Classifier</span>
                <span className={`rounded-sm border px-1.5 py-0.2 text-[10px] font-medium ${activeJudgeMode.badgeClass}`}>
                  {activeJudgeMode.shortLabel}
                </span>
                <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.2 font-mono text-[10px] text-text-muted">
                  {activeJevChoice ? `${activeJevChoice.providerLabel} / ${jevModel}` : jevModel}
                </span>
                {thresholdApplies && (
                  <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.2 text-[10px] text-text-muted">
                    Threshold: {(threshold * 100).toFixed(0)}%
                  </span>
                )}
                {comboOverrideActive ? (
                  <span className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-medium text-amber-400">
                    Combo Override
                  </span>
                ) : (
                  <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.2 text-[10px] text-text-muted">
                    Global Default
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Classifier upstream status, derived from the registry declaration */}
            {(() => {
              const status = selectedProvider ? providerStatus(selectedProvider) : null;
              const label = selectedProvider?.label || "no classifier upstream";
              if (!status) {
                return (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                    <Icon name="warning" size={13} />
                    <span>No Jev upstream registered</span>
                  </span>
                );
              }
              if (status.kind === "keyless") {
                return (
                  <span className="inline-flex items-center gap-1 rounded bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[11px] font-medium text-cyan-400">
                    <Icon name="verified" size={13} />
                    <span>{label} · keyless</span>
                  </span>
                );
              }
              if (status.kind === "pool") {
                return (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    <Icon name="check_circle" size={13} />
                    <span>{label} ({status.count} active)</span>
                  </span>
                );
              }
              if (status.kind === "key") {
                return (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    <Icon name="key" size={13} />
                    <span>{label} · key configured</span>
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                  <Icon name="warning" size={13} />
                  <span>{label}: no key or connection</span>
                </span>
              );
            })()}

            <button
              type="button"
              className="text-text-muted hover:text-text-main transition-colors p-1"
              aria-label={showAdvancedClassifier ? "Collapse classifier settings" : "Expand classifier settings"}
            >
              <Icon name={showAdvancedClassifier ? "expand_less" : "expand_more"} size={18} />
            </button>
          </div>
        </div>

        {/* Expanded Classifier Settings */}
        {showAdvancedClassifier && (
          <div className="border-t border-border/60 bg-surface-2/40 p-3.5 flex flex-col gap-3.5 text-xs">
            {/* Scope Switch: Global vs Combo Override */}
            <div className="flex items-center justify-between gap-3 bg-surface p-2.5 rounded border border-border">
              <div>
                <span className="font-semibold text-text-main">Configuration Scope</span>
                <p className="text-[11px] text-text-muted">
                  {comboOverrideActive
                    ? "This combo uses dedicated classifier settings."
                    : "This combo inherits the instance-wide global settings."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-muted">Global</span>
                <Toggle
                  size="sm"
                  checked={comboOverrideActive}
                  onChange={handleToggleComboOverride}
                  aria-label="Override classifier settings for this combo"
                />
                <span className="text-[11px] font-medium text-text-main">Combo Override</span>
              </div>
            </div>

            {/* Judge Mode & Model in a clean 2-column grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Judge Mode */}
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-text-main">Judge Mode</label>
                <select
                  value={activeJudgeMode.value}
                  onChange={(e) => handleJudgeModeChange(e.target.value)}
                  disabled={judgeSaving}
                  className="rounded-sm border border-border bg-surface px-2.5 h-8 text-xs font-medium text-text-main focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all disabled:opacity-50"
                >
                  {JUDGE_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-text-muted">{activeJudgeMode.description}</p>
              </div>

              {/* Jev Model — every provider the registry declares as a classifier upstream */}
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-text-main">Classifier Upstream</label>
                <select
                  value={activeJevChoice ? `${activeJevChoice.provider}|${activeJevChoice.value}` : ""}
                  onChange={(e) => handleJevModelChange(e.target.value)}
                  disabled={judgeSaving || JEV_MODEL_CHOICES.length === 0}
                  className="rounded-sm border border-border bg-surface px-2.5 h-8 text-xs font-medium text-text-main focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all disabled:opacity-50"
                >
                  {JEV_MODEL_CHOICES.map((c) => (
                    <option key={`${c.provider}|${c.value}`} value={`${c.provider}|${c.value}`}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-text-muted font-mono truncate">
                  Endpoint: {jevEndpoint || "none registered"}
                </span>
              </div>
            </div>

            {/* Per-provider credentials: key-backed classifier providers only. */}
            {JEV_PROVIDERS.filter((p) => p.keyPool).length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
                <span className="font-semibold text-text-main">Provider Keys</span>
                <p className="text-[10px] text-text-muted">
                  Leave blank to keep using the stored value. Keys stored here are never sent back to the browser.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {JEV_PROVIDERS.filter((p) => p.keyPool).map((p) => {
                    const status = providerStatus(p);
                    return (
                      <div key={p.provider} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] font-medium text-text-main truncate" title={p.label}>
                            {p.label}
                          </label>
                          {status.kind === "pool" ? (
                            <span className="shrink-0 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 text-[10px] text-emerald-400">
                              {status.count} connection{status.count === 1 ? "" : "s"}
                            </span>
                          ) : status.kind === "key" ? (
                            <span className="shrink-0 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 text-[10px] text-emerald-400">
                              key set
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.2 text-[10px] text-amber-400">
                              not configured
                            </span>
                          )}
                        </div>
                        <Input
                          type="password"
                          value={keyDraft?.[p.provider] ?? providerKeyValue(p.provider)}
                          placeholder={status.kind === "missing" ? "Paste API key" : "••••••"}
                          disabled={judgeSaving}
                          onChange={(e) =>
                            setKeyDraft((prev) => ({ ...(prev || {}), [p.provider]: e.target.value }))
                          }
                          onBlur={() => handleProviderKeyChange(p.provider)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Threshold Slider */}
            {thresholdApplies && (
              <div className="flex flex-col gap-1.5 border-t border-border/40 pt-3">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-text-main">
                    Jev Confidence Threshold
                  </label>
                  <span className="font-mono text-xs font-bold text-primary">
                    {(Number(shownThreshold) * 100).toFixed(0)}% ({Number(shownThreshold).toFixed(2)})
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={shownThreshold}
                  disabled={judgeSaving}
                  onChange={(e) => setThresholdDraft(Number(e.target.value))}
                  onPointerUp={handleThresholdRelease}
                  onKeyUp={handleThresholdRelease}
                  onBlur={handleThresholdRelease}
                  className="h-1.5 w-full cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-text-muted">
                  Classifications below this threshold automatically escalate to the LLM judge (or Hard tier in Jev Only mode).
                </p>
              </div>
            )}

            {/* Capabilities links, one per registered classifier provider */}
            <div className="flex flex-col gap-2 border-t border-border/40 pt-3 text-[11px]">
              <div className="flex items-center gap-2 text-text-muted">
                <Icon name="key" size={14} className="text-text-muted" />
                <span>
                  Provider accounts and pooled API keys are managed in{" "}
                  <strong className="text-text-main">Capabilities Providers &gt; Jev Classifier</strong>.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {JEV_PROVIDERS.map((p) => (
                  <Link
                    key={p.provider}
                    href={`/dashboard/capabilities-providers/jev/${p.provider}`}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    <span>{p.label}</span>
                    <Icon name="arrow_forward" size={13} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Model Selection Modal for adding models to Easy or Hard tier */}
      {activeTierPicker && (
        <ModelSelectModal
          isOpen={!!activeTierPicker}
          onClose={() => setActiveTierPicker(null)}
          onSelect={(m) => handleAddModelsToTier(activeTierPicker, [m?.value])}
          onDeselect={(m) => handleRemoveModelFromTier(activeTierPicker, m?.value)}
          activeProviders={activeProviders}
          title={`Select Models for ${activeTierPicker === "easy" ? "Easy Tier" : "Hard Tier"}`}
          addedModelValues={activeTierPicker === "easy" ? easyModels : hardModels}
          closeOnSelect={false}
        />
      )}

      {/* Judge Model Select Modal */}
      {showJudgeSelect && (
        <ModelSelectModal
          isOpen={showJudgeSelect}
          onClose={() => setShowJudgeSelect(false)}
          onSelect={(m) => {
            onSetStrategy({ judgeModel: m?.value || "" });
            setShowJudgeSelect(false);
          }}
          activeProviders={activeProviders}
          title="Select Judge Model (Smart Routing)"
          addedModelValues={judge ? [judge] : []}
          closeOnSelect={true}
        />
      )}
    </div>
  );
}

SmartRoutingSection.propTypes = {
  combo: PropTypes.object,
  strategy: PropTypes.object,
  onSetStrategy: PropTypes.func.isRequired,
  onUpdateComboModels: PropTypes.func,
  activeProviders: PropTypes.array,
  getCaps: PropTypes.func,
};

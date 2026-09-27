"use client";

import { useState, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
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
import { Modal, ModelSelectModal, CapacityBadges, Button, Input, Toggle } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import Icon from "@/shared/components/Icon";
import {
  JEV_MODEL_CHOICES,
  DEFAULT_JEV_MODEL,
} from "open-sse/config/jevModels.js";

const TIER_CONFIG = [
  {
    key: "easy",
    label: "Easy Tier",
    shortLabel: "Easy",
    icon: "bolt",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    headerBg: "bg-emerald-500/10 text-emerald-400",
    cardBorder: "border-emerald-500/30",
    cardBg: "bg-emerald-500/[0.03]",
    title: "Fast & Economical",
    subtitle: "Short prompts, quick Q&A, lightweight edits, minimal token cost",
  },
  {
    key: "hard",
    label: "Hard Tier",
    shortLabel: "Hard",
    icon: "diamond",
    badgeColor: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    headerBg: "bg-rose-500/10 text-rose-400",
    cardBorder: "border-rose-500/30",
    cardBg: "bg-rose-500/[0.03]",
    title: "Frontier Capability",
    subtitle: "Complex architecture, deep reasoning, large context, coding & tool calling",
  },
];

const POLICY_DESCRIPTIONS = {
  balanced: "Balanced: Evaluates prompt complexity against confidence matrix, balancing latency, quality, and cost.",
  cost_efficient: "Cost Efficient: Aggressively routes toward Easy and Medium tiers. Escalates to Hard only when strictly required.",
  capability_heavy: "Capability Heavy: Biases toward Frontier / Hard models for tasks requiring maximum reasoning depth.",
};

const JUDGE_MODES = [
  {
    value: "two-layer",
    label: "Two-Layer (Jev + LLM)",
    shortLabel: "Two-Layer",
    badgeLabel: "Two-Layer (Jev + LLM)",
    icon: "layers",
    badgeClass: "bg-primary/10 text-primary border-primary/30",
    description: "Primary fast classification via TypeSafe Jev classifier (<50ms). Automatically escalates to LLM judge if confidence falls below threshold or Jev fails.",
  },
  {
    value: "jev-only",
    label: "Jev Only (<50ms)",
    shortLabel: "Jev Only",
    badgeLabel: "Jev Only",
    icon: "bolt",
    badgeClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    description: "Pure classifier mode via TypeSafe Jev. Ultra-low latency (<50ms) with zero LLM judge token consumption. Escalates to Hard tier if confidence is below threshold.",
  },
  {
    value: "llm-only",
    label: "LLM Only",
    shortLabel: "LLM Only",
    badgeLabel: "LLM Only",
    icon: "smart_toy",
    badgeClass: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    description: "Standard LLM judge classification. Directly invokes configured judge model without calling TypeSafe Jev.",
  },
];

// Sortable item component with drag handle for reordering inside tier modal
function SortableTierModelRow({ id, model, index, onRemove, getCaps }) {
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
      className={`group flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 p-2.5 transition-colors ${
        isDragging ? "border-primary shadow-md" : "hover:border-border/80"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab touch-none size-7 rounded flex items-center justify-center text-text-muted hover:text-primary hover:bg-surface active:cursor-grabbing shrink-0 transition-colors"
          title="Drag to reorder priority"
          aria-label="Drag to reorder priority"
        >
          <Icon name="drag_indicator" size={18} />
        </button>

        {/* Priority Rank */}
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded font-mono text-xs font-semibold bg-surface text-text-muted border border-border/50"
          title={`Priority #${index + 1}: Attempted first, falls back to subsequent models on failure`}
        >
          #{index + 1}
        </span>

        {/* Model ID & Badges */}
        <div className="truncate min-w-0 flex-1">
          <code className="truncate font-mono text-xs font-medium text-text-main block" title={model}>
            {model}
          </code>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <CapacityBadges caps={getCaps?.(model)} />
        <button
          type="button"
          onClick={onRemove}
          className="size-7 rounded flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          title="Remove model from tier"
          aria-label="Remove model from tier"
        >
          <Icon name="delete" size={18} />
        </button>
      </div>
    </div>
  );
}

SortableTierModelRow.propTypes = {
  id: PropTypes.string.isRequired,
  model: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
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
  const notify = useNotificationStore();

  // Modal State for Tier Reorder & Management
  const [activeTierModal, setActiveTierModal] = useState(null); // "easy" | "medium" | "hard" | null
  const [modalTierModels, setModalTierModels] = useState([]);
  const [showModelPickerModal, setShowModelPickerModal] = useState(false);
  const [quickInputModel, setQuickInputModel] = useState("");

  const judge = strategy.judgeModel || "";
  const policy = strategy.difficultyPolicy || "balanced";

  // Difficulty judge controls (judgeMode / Jev confidence threshold / TypeSafe API key).
  // Defaults are instance-wide (GET|PATCH /api/settings); a combo may opt out of them
  // with a per-combo override stored on its own strategy, which chat.js reads before
  // falling back to the global settings.
  const [globalJudge, setGlobalJudge] = useState(null); // null until /api/settings answers
  const [globalJudgeError, setGlobalJudgeError] = useState("");
  const [judgeSaving, setJudgeSaving] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [thresholdDraft, setThresholdDraft] = useState(null);

  const comboKeyConfigured =
    strategy.typeSafeKeyConfigured === true || typeof strategy.typeSafeApiKey === "string";
  const comboOverrideActive =
    comboKeyConfigured ||
    strategy.judgeMode != null ||
    strategy.jevConfidenceThreshold != null ||
    strategy.jevModel != null;

  const globalMode = globalJudge?.judgeMode || "two-layer";
  const globalThreshold =
    typeof globalJudge?.jevConfidenceThreshold === "number" ? globalJudge.jevConfidenceThreshold : 0.7;
  const globalKeyConfigured = globalJudge?.typeSafeKeyConfigured === true;

  const judgeMode =
    comboOverrideActive && strategy.judgeMode != null ? strategy.judgeMode : globalMode;
  const threshold =
    comboOverrideActive && typeof strategy.jevConfidenceThreshold === "number"
      ? strategy.jevConfidenceThreshold
      : globalThreshold;
  const keySource = comboKeyConfigured ? "combo" : globalKeyConfigured ? "global" : "none";

  // Jev classifier model: combo override > global setting > default. The endpoint is
  // derived from the model (OpenCode Zen vs TypeSafe AI), never edited by hand.
  const globalJevModel = globalJudge?.jevModel || DEFAULT_JEV_MODEL;
  const jevModel =
    comboOverrideActive && strategy.jevModel != null ? strategy.jevModel : globalJevModel;
  const activeJevChoice =
    JEV_MODEL_CHOICES.find((c) => c.value === jevModel) || JEV_MODEL_CHOICES[0];
  const jevEndpoint = activeJevChoice.endpoint;

  const activeJudgeMode = JUDGE_MODES.find((m) => m.value === judgeMode) || JUDGE_MODES[0];
  const thresholdApplies = judgeMode !== "llm-only"; // LLM Only never calls Jev
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
        typeSafeKeyConfigured: data.typeSafeKeyConfigured === true,
      });
      setGlobalJudgeError("");
    } catch (error) {
      setGlobalJudgeError(error?.message || "Global judge settings unavailable");
    }
  };

  useEffect(() => {
    loadGlobalJudge();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      notify.success("Saved global difficulty judge settings");
    } catch (error) {
      notify.error(error?.message || "Failed to save difficulty judge settings");
    } finally {
      setJudgeSaving(false);
    }
  };

  const handleJudgeModeChange = (value) => {
    if (comboOverrideActive) onSetStrategy({ judgeMode: value });
    else saveGlobalJudge({ judgeMode: value });
  };

  const handleJevModelChange = (value) => {
    const choice = JEV_MODEL_CHOICES.find((c) => c.value === value) || JEV_MODEL_CHOICES[0];
    if (comboOverrideActive) {
      // The endpoint follows the model — stored alongside it so combo config stays
      // self-describing.
      onSetStrategy({ jevModel: choice.value, jevEndpoint: choice.endpoint });
    } else {
      saveGlobalJudge({ jevModel: choice.value });
    }
  };

  // The slider edits a local draft so a drag does not fire one PATCH per pixel;
  // the value is committed once the pointer / keyboard interaction is released.
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
      // Freeze the currently effective values so turning the override on never
      // changes routing behaviour on its own.
      onSetStrategy({
        judgeMode,
        jevConfidenceThreshold: threshold,
        jevModel,
        jevEndpoint,
      });
      notify.success(`Judge settings now override the global defaults for "${comboName}"`);
    } else {
      // undefined is dropped by JSON.stringify, so the keys are really removed
      // and the combo falls back to the global settings.
      const patch = {
        judgeMode: undefined,
        jevConfidenceThreshold: undefined,
        jevModel: undefined,
        jevEndpoint: undefined,
      };
      if (comboKeyConfigured) {
        patch.typeSafeApiKey = ""; // "" clears the combo key (global key takes over)
        patch.typeSafeKeyConfigured = false;
      }
      onSetStrategy(patch);
      notify.success(`Judge settings now inherit the global defaults for "${comboName}"`);
    }
  };

  const handleSaveKey = () => {
    const value = keyDraft.trim();
    if (!value) return;
    if (comboOverrideActive) {
      onSetStrategy({ typeSafeApiKey: value, typeSafeKeyConfigured: true });
      notify.success(`TypeSafe API key saved for "${combo?.name || "this combo"}"`);
    } else {
      saveGlobalJudge({ typeSafeApiKey: value });
    }
    setKeyDraft("");
  };

  const handleClearKey = () => {
    setKeyDraft("");
    if (comboKeyConfigured) {
      onSetStrategy({ typeSafeApiKey: "", typeSafeKeyConfigured: false });
      notify.success("Cleared this combo's TypeSafe API key");
    } else if (globalKeyConfigured) {
      saveGlobalJudge({ typeSafeApiKey: "" });
    }
  };

  const easyModels = useMemo(() => (Array.isArray(strategy.easyModels) ? strategy.easyModels : []), [strategy.easyModels]);
  const mediumModels = useMemo(() => (Array.isArray(strategy.mediumModels) ? strategy.mediumModels : []), [strategy.mediumModels]);
  const hardModels = useMemo(() => (Array.isArray(strategy.hardModels) ? strategy.hardModels : []), [strategy.hardModels]);

  const allTiersEmpty = easyModels.length === 0 && mediumModels.length === 0 && hardModels.length === 0;

  const getTierModels = (key) => {
    if (key === "easy") return easyModels;
    if (key === "medium") return mediumModels;
    if (key === "hard") return hardModels;
    return [];
  };

  const syncComboModels = (newEasy, newMed, newHard) => {
    if (!onUpdateComboModels) return;
    const combined = Array.from(new Set([...newEasy, ...newMed, ...newHard].filter(Boolean)));
    onUpdateComboModels(combined);
  };

  // Open modal for a tier
  const handleOpenTierModal = (tierKey) => {
    setActiveTierModal(tierKey);
    setModalTierModels([...getTierModels(tierKey)]);
    setQuickInputModel("");
  };

  // Apply modal changes
  const handleSaveTierModal = () => {
    if (!activeTierModal) return;
    const patch = { [`${activeTierModal}Models`]: modalTierModels };
    onSetStrategy(patch);

    const nextEasy = activeTierModal === "easy" ? modalTierModels : easyModels;
    const nextMed = activeTierModal === "medium" ? modalTierModels : mediumModels;
    const nextHard = activeTierModal === "hard" ? modalTierModels : hardModels;
    syncComboModels(nextEasy, nextMed, nextHard);
    notify.success(`Updated ${activeTierModal.toUpperCase()} tier models`);
    setActiveTierModal(null);
  };

  // Drag sensors for dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = modalTierModels.indexOf(active.id);
    const newIndex = modalTierModels.indexOf(over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      setModalTierModels(arrayMove(modalTierModels, oldIndex, newIndex));
    }
  };

  const handleAddQuickInputToModal = () => {
    const val = quickInputModel.trim();
    if (!val) return;
    const parts = val.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    const next = [...modalTierModels];
    for (const p of parts) {
      if (!next.includes(p)) next.push(p);
    }
    setModalTierModels(next);
    setQuickInputModel("");
  };

  const handleRemoveFromModal = (index) => {
    const next = [...modalTierModels];
    next.splice(index, 1);
    setModalTierModels(next);
  };

  const handleAddFromBrowserModal = (modelValue) => {
    if (!modelValue || modalTierModels.includes(modelValue)) return;
    setModalTierModels((prev) => [...prev, modelValue]);
  };

  const handleRemoveFromBrowserModal = (modelValue) => {
    if (!modelValue) return;
    setModalTierModels((prev) => prev.filter((m) => m !== modelValue));
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
    syncComboModels(easy, [], hard);
    notify.success(`Auto-distributed ${models.length} models across 2 tiers (Easy & Hard)`);
  };

  const activeTierConfig = TIER_CONFIG.find((t) => t.key === activeTierModal);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3.5 sm:p-4">
      {/* Judge & Policy Configuration Bar */}
      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Judge Model Control */}
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
            <Icon name="smart_toy" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-text-main">Judge Model</span>
              <span
                className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-medium ${activeJudgeMode.badgeClass}`}
                title={activeJudgeMode.description}
              >
                {activeJudgeMode.shortLabel}
              </span>
              <span className="text-[11px] text-text-muted hidden sm:inline">
                — LLM classifier for the Easy, Medium, or Hard tiers
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowJudgeSelect(true)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-primary/30 bg-primary/10 px-2.5 h-7 font-mono text-xs font-medium text-primary hover:border-primary hover:bg-primary/15 transition-all"
                title="Select judge model"
              >
                <Icon name="gavel" size={18} />
                <span className="truncate">{judge || "Auto — First Model in Combo"}</span>
                {judge ? <CapacityBadges caps={getCaps?.(judge)} /> : null}
              </button>
              {judge ? (
                <button
                  type="button"
                  onClick={() => onSetStrategy({ judgeModel: "" })}
                  className="inline-flex items-center gap-1 rounded-sm px-2 h-7 text-xs hover:text-danger hover:bg-danger/10 transition-colors"
                  title="Reset to Auto"
                >
                  <Icon name="restart_alt" size={18} />
                  <span>Auto</span>
                </button>
              ) : (
                <span className="text-[11px] text-text-muted italic">(Uses combo&apos;s first healthy model)</span>
              )}
              {judgeMode === "jev-only" && (
                <span
                  className="text-[11px] text-amber-400/90 italic"
                  title="Jev Only mode classifies prompts through TypeSafe Jev without calling the LLM judge"
                >
                  (not used in Jev Only mode)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Policy Selector */}
        <div className="flex flex-col gap-1 sm:border-l sm:border-border sm:pl-4 sm:min-w-[240px]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-text-main">Routing Policy</span>
            <span className="text-[11px] text-primary capitalize font-medium">{policy.replace("_", " ")}</span>
          </div>
          <select
            value={policy}
            onChange={(e) => onSetStrategy({ difficultyPolicy: e.target.value })}
            className="rounded-sm border border-border bg-surface px-2.5 h-7 text-xs font-medium text-text-main focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
          >
            <option value="balanced">Balanced (Optimal Tradeoff)</option>
            <option value="cost_efficient">Cost Efficient (Aggressive Fast Tiers)</option>
            <option value="capability_heavy">Capability Heavy (Frontier Reasoning)</option>
          </select>
          <p className="text-[11px] text-text-muted line-clamp-1" title={POLICY_DESCRIPTIONS[policy]}>
            {POLICY_DESCRIPTIONS[policy]}
          </p>
        </div>
      </div>

      {/* Difficulty Judge: judgeMode, Jev confidence threshold, TypeSafe API key */}
      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Icon name="layers" size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-text-main">Difficulty Judge</span>
                <span className="text-[11px] text-text-muted hidden sm:inline">
                  — Who classifies the prompt: TypeSafe Jev, the LLM judge, or both
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-medium ${activeJudgeMode.badgeClass}`}
                >
                  <Icon name={activeJudgeMode.icon} size={14} />
                  {activeJudgeMode.badgeLabel}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-medium ${
                    comboOverrideActive
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : "border-border bg-surface-3 text-text-muted"
                  }`}
                  title={
                    comboOverrideActive
                      ? "This combo stores its own judgeMode, Jev threshold and TypeSafe key"
                      : "This combo follows the global judge settings"
                  }
                >
                  <Icon name={comboOverrideActive ? "tune" : "hub"} size={14} />
                  {comboOverrideActive ? "Combo override" : "Global default"}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-medium ${
                    keySource === "none"
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  }`}
                  title="TypeSafe API key used by the Jev classifier"
                >
                  <Icon name="key" size={14} />
                  {keySource === "none"
                    ? "No TypeSafe key"
                    : `TypeSafe key: ${keySource === "combo" ? "combo" : "global"}`}
                </span>
                {globalJudgeError && (
                  <span className="text-[10px] font-medium text-danger" title={globalJudgeError}>
                    {globalJudgeError}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Scope switch: global defaults vs per-combo override */}
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2.5 py-1.5">
            <span className="text-[11px] text-text-muted">Global</span>
            <Toggle
              size="sm"
              checked={comboOverrideActive}
              onChange={handleToggleComboOverride}
              aria-label="Override judge settings for this combo"
              title="Store judgeMode, Jev threshold and TypeSafe key on this combo instead of the global defaults"
            />
            <span className="text-[11px] font-medium text-text-main">Combo override</span>
          </div>
        </div>

        {/* Judge Mode */}
        <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2.5 sm:flex-row sm:items-start sm:gap-3">
          <span className="text-xs font-semibold text-text-main sm:w-32 sm:shrink-0 sm:pt-1.5">
            Judge Mode
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activeJudgeMode.value}
                onChange={(e) => handleJudgeModeChange(e.target.value)}
                disabled={judgeSaving}
                className="rounded-sm border border-border bg-surface px-2.5 h-7 text-xs font-medium text-text-main focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all disabled:opacity-50"
              >
                {JUDGE_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-text-muted">
                {comboOverrideActive ? "Applies to this combo" : "Applies to every combo"}
              </span>
            </div>
            <p className="text-[11px] text-text-muted">{activeJudgeMode.description}</p>
          </div>
        </div>

        {/* Jev classifier model + auto-derived upstream endpoint */}
        <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2.5 sm:flex-row sm:items-start sm:gap-3">
          <span className="text-xs font-semibold text-text-main sm:w-32 sm:shrink-0 sm:pt-1.5">
            Jev Model
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activeJevChoice.value}
                onChange={(e) => handleJevModelChange(e.target.value)}
                disabled={judgeSaving}
                aria-label="Jev classifier model"
                className="rounded-sm border border-border bg-surface px-2.5 h-7 text-xs font-medium text-text-main focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all disabled:opacity-50"
              >
                {JEV_MODEL_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <span
                className="inline-flex max-w-full items-center gap-1 rounded-sm border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-text-muted"
                title="Upstream endpoint derived from the selected model"
              >
                <Icon name="hub" size={12} />
                <span className="truncate">{jevEndpoint}</span>
              </span>
            </div>
            <p className="text-[11px] text-text-muted">
              {activeJevChoice.value === "jev-latest"
                ? "Direct TypeSafe: keys come from the TypeSafe connection pool (multi-key, round-robin), then this combo/global key, then TYPESAFE_API_KEY."
                : "OpenCode Zen: used when an OpenCode Zen connection is active (free tier needs no key); jev-1.13 charges usage to that connection."}
            </p>
          </div>
        </div>

        {/* Jev confidence threshold */}
        <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2.5 sm:flex-row sm:items-start sm:gap-3">
          <span className="text-xs font-semibold text-text-main sm:w-32 sm:shrink-0 sm:pt-1">
            Jev Threshold
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={shownThreshold}
                disabled={!thresholdApplies || judgeSaving}
                onChange={(e) => setThresholdDraft(Number(e.target.value))}
                onPointerUp={handleThresholdRelease}
                onKeyUp={handleThresholdRelease}
                onBlur={handleThresholdRelease}
                aria-label="Jev confidence threshold"
                title="Minimum TypeSafe Jev confidence required to accept a classification"
                className="h-1.5 min-w-[140px] flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="w-20 shrink-0 rounded-sm border border-border bg-surface-2 px-1.5 py-1 text-center font-mono text-[11px] font-medium text-text-main">
                {Number(shownThreshold).toFixed(2)}
              </span>
            </div>
            <p className="text-[11px] text-text-muted">
              {thresholdApplies
                ? `Jev must reach ${(threshold * 100).toFixed(0)}% confidence to accept a tier. Below it: ${
                    judgeMode === "jev-only"
                      ? "escalate straight to the Hard tier"
                      : "escalate to the LLM judge"
                  }.`
                : "Ignored in LLM Only mode — Jev is never called."}
            </p>
          </div>
        </div>

        {/* TypeSafe API key */}
        <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2.5 sm:flex-row sm:items-start sm:gap-3">
          <span className="text-xs font-semibold text-text-main sm:w-32 sm:shrink-0 sm:pt-1.5">
            TypeSafe API Key
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveKey();
                  }
                }}
                placeholder={
                  keySource === "none"
                    ? "ts-… key for api.typesafe.ai"
                    : "Enter a new key to replace the saved one"
                }
                autoComplete="off"
                spellCheck={false}
                disabled={judgeSaving}
                className="w-full sm:w-72"
                inputClassName="h-8 text-xs font-mono"
              />
              <Button
                size="sm"
                variant="secondary"
                icon="key"
                disabled={!keyDraft.trim() || judgeSaving}
                onClick={handleSaveKey}
              >
                Save Key
              </Button>
              {keySource !== "none" && (
                <Button size="sm" variant="ghost" onClick={handleClearKey} disabled={judgeSaving}>
                  Clear
                </Button>
              )}
            </div>
            <p className="text-[11px] text-text-muted">
              {keySource === "none"
                ? "Needed for Jev: without it Two-Layer degrades to LLM Only and Jev Only falls back to the policy default."
                : keySource === "combo"
                  ? `Stored on "${combo?.name || "this combo"}" and overrides the global key.`
                  : "Stored globally — used by every combo without its own key."}
            </p>
          </div>
        </div>
      </div>

      {/* Auto-distribute Banner when tiers are empty */}
      {allTiersEmpty && combo?.models && combo.models.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Icon className="text-primary shrink-0 mt-0.5" name="auto_fix_high" size={18} />
            <div>
              <p className="font-semibold text-text-main">Distribute existing models into tiers</p>
              <p className="text-[11px] text-text-muted">
                This combo has {combo.models.length} model(s). Auto-distribute them evenly into Easy, Medium, and Hard tiers?
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

      {/* 3-Tier Grid Overview Cards with In-Card Model Previews */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
        {TIER_CONFIG.map((tier) => {
          const tierModels = getTierModels(tier.key);

          return (
            <div
              key={tier.key}
              onClick={() => handleOpenTierModal(tier.key)}
              className={`group flex flex-col justify-between gap-3 rounded-md border ${tier.cardBorder} ${tier.cardBg} p-3.5 hover:border-primary/50 transition-all cursor-pointer shadow-sm`}
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`flex size-8 shrink-0 items-center justify-center rounded-md ${tier.headerBg}`}>
                      <Icon name={tier.icon} size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-text-main truncate">{tier.label}</span>
                        <span className="rounded-full bg-surface-3 px-1.5 py-0.2 font-mono text-[10px] font-medium text-text-muted border border-border">
                          {tierModels.length}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-text-muted truncate mt-0.5" title={tier.title}>
                        {tier.title}
                      </p>
                    </div>
                  </div>

                  <Button
                    size="xs"
                    variant="secondary"
                    icon="tune"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenTierModal(tier.key);
                    }}
                    title={`Configure ${tier.label} models`}
                  >
                    Configure
                  </Button>
                </div>

                <p className="text-[11px] text-text-muted/80 mt-2 line-clamp-2">
                  {tier.subtitle}
                </p>

                {/* Model preview directly on the card */}
                <div className="mt-3 pt-2.5 border-t border-border/50 flex flex-col gap-1.5">
                  {tierModels.length === 0 ? (
                    <span className="text-[11px] text-text-muted/60 italic">No models configured</span>
                  ) : (
                    <>
                      {tierModels.slice(0, 3).map((m, idx) => (
                        <div
                          key={`${m}-${idx}`}
                          className="flex items-center justify-between gap-1.5 rounded bg-surface/80 px-2 py-1 border border-border/40 text-[11px] font-mono"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-semibold text-text-muted">#{idx + 1}</span>
                            <span className="truncate text-text-main" title={m}>{m}</span>
                          </div>
                          <CapacityBadges caps={getCaps?.(m)} />
                        </div>
                      ))}
                      {tierModels.length > 3 && (
                        <span className="text-[10px] font-medium text-primary text-center">
                          +{tierModels.length - 3} more models
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Accessible Tier Configuration Modal */}
      {activeTierModal && activeTierConfig && (
        <Modal
          isOpen={!!activeTierModal}
          onClose={() => setActiveTierModal(null)}
          title={`Configure ${activeTierConfig.label}`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-text-muted">
                Total in tier: <strong className="text-text-main font-semibold">{modalTierModels.length}</strong> model(s)
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setActiveTierModal(null)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" icon="check" onClick={handleSaveTierModal}>
                  Save Tier Order
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-xs text-text-muted">
              Drag the grip handle to arrange priority. Priority <strong>#1</strong> is attempted first; subsequent models serve as automatic failovers.
            </p>

            {/* Quick Add Model Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-md bg-surface-2 border border-border">
              <div className="flex-1 flex items-center gap-2">
                <Input
                  placeholder="Type model ID or comma-separated list..."
                  value={quickInputModel}
                  onChange={(e) => setQuickInputModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddQuickInputToModal();
                    }
                  }}
                  className="text-xs font-mono w-full"
                  inputClassName="h-11 text-xs font-mono py-2 sm:h-9 sm:py-1"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon="add"
                  disabled={!quickInputModel.trim()}
                  onClick={handleAddQuickInputToModal}
                >
                  Add
                </Button>
              </div>

              <Button
                size="sm"
                variant="primary"
                icon="list"
                onClick={() => setShowModelPickerModal(true)}
                className="shrink-0"
              >
                Browse Catalog
              </Button>
            </div>

            {/* Sortable Drag & Drop List */}
            <div className="max-h-[360px] overflow-y-auto pr-1 flex flex-col gap-2">
              {modalTierModels.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-border rounded-md bg-surface-2/50">
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                    <Icon className="text-text-muted" name="drag_indicator" size={18} />
                    <span className="font-semibold text-text-main text-xs">No models in this tier</span>
                    <p className="text-[11px] text-text-muted">
                      Click &ldquo;Browse Catalog&rdquo; or type a model ID above to add models to {activeTierConfig.shortLabel} tier.
                    </p>
                  </div>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                >
                  <SortableContext items={modalTierModels} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">
                      {modalTierModels.map((model, index) => (
                        <SortableTierModelRow
                          key={model}
                          id={model}
                          model={model}
                          index={index}
                          onRemove={() => handleRemoveFromModal(index)}
                          getCaps={getCaps}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Model Catalog Selector Modal */}
      {showModelPickerModal && activeTierModal && (
        <ModelSelectModal
          isOpen={showModelPickerModal}
          onClose={() => setShowModelPickerModal(false)}
          onSelect={(m) => handleAddFromBrowserModal(m?.value)}
          onDeselect={(m) => handleRemoveFromBrowserModal(m?.value)}
          activeProviders={activeProviders}
          title={`Select Models for ${activeTierConfig?.label}`}
          addedModelValues={modalTierModels}
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

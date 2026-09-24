"use client";

import { useState, useMemo } from "react";
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
import { Modal, ModelSelectModal, CapacityBadges, Button, Input } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import Icon from "@/shared/components/Icon";

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
    key: "medium",
    label: "Medium Tier",
    shortLabel: "Medium",
    icon: "psychology",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    headerBg: "bg-amber-500/10 text-amber-400",
    cardBorder: "border-amber-500/30",
    cardBg: "bg-amber-500/[0.03]",
    title: "Standard Reasoning",
    subtitle: "Typical coding, agent tasks, multi-turn chat, refactoring",
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
    subtitle: "Complex architecture, deep reasoning, large context, tool calling",
  },
];

const POLICY_DESCRIPTIONS = {
  balanced: "Balanced: Evaluates prompt complexity against confidence matrix, balancing latency, quality, and cost.",
  cost_efficient: "Cost Efficient: Aggressively routes toward Easy and Medium tiers. Escalates to Hard only when strictly required.",
  capability_heavy: "Capability Heavy: Biases toward Frontier / Hard models for tasks requiring maximum reasoning depth.",
};

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
    const medium = [];
    const hard = [];

    if (models.length === 1) {
      easy.push(models[0]);
    } else if (models.length === 2) {
      easy.push(models[0]);
      hard.push(models[1]);
    } else {
      const sliceSize = Math.ceil(models.length / 3);
      easy.push(...models.slice(0, sliceSize));
      medium.push(...models.slice(sliceSize, sliceSize * 2));
      hard.push(...models.slice(sliceSize * 2));
    }

    onSetStrategy({
      easyModels: easy,
      mediumModels: medium,
      hardModels: hard,
    });
    syncComboModels(easy, medium, hard);
    notify.success("Models distributed across Easy, Medium, and Hard tiers");
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
              <span className="text-[11px] text-text-muted hidden sm:inline">
                — Classifies prompt complexity into Easy, Medium, or Hard
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

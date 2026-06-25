"use client";

import { useMemo, useState } from "react";
import AppIcon from "@/shared/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ROUTING_STRATEGIES } from "@/shared/constants/routingStrategies";
import { getPricingForModel } from "@/shared/constants/pricing";
import { buildGroupedSelectableModels } from "@/lib/opencodeSync/modelSelectOptions";
import {
  isIntelligentStrategy,
  normalizeIntelligentRoutingConfig,
} from "@/lib/combos/intelligentRouting";
import BuilderIntelligentStep from "../BuilderIntelligentStep";
import { ModelSelectModal } from "@/shared/components";


const TABS = [
  { id: "overview", label: "Overview", icon: "dashboard" },
  { id: "strategy", label: "Strategy", icon: "route" },
  { id: "advanced", label: "Advanced", icon: "tune" },
] as const;

type ComboRefStep = {
  kind: "combo-ref";
  comboName: string;
  label?: string;
};

type ModelStep = {
  kind: "model";
  model: string;
  providerId?: string;
  connectionId?: string | null;
  label?: string;
};

type ComboStep = string | ComboRefStep | ModelStep;

type ComboRecord = {
  id?: string | null;
  name?: string;
  strategy?: string;
  priority?: number;
  models?: ComboStep[];
  config?: Record<string, unknown>;
  system_message?: string;
  tool_filter_regex?: string;
  context_cache_protection?: boolean;
};

type ProviderConnectionRecord = {
  id?: string;
  provider?: string;
  label?: string;
  name?: string;
};

type BuilderModelOption = {
  value: string;
  name: string;
  isCustom?: boolean;
};

type BuilderProviderGroup = {
  providerId: string;
  name?: string;
  models?: BuilderModelOption[];
};

type ComboDraft = {
  id: string | null;
  name: string;
  strategy: string;
  priority: string;
  models: ComboStep[];
  config: Record<string, unknown>;
  systemMessage: string;
  toolFilterRegex: string;
  contextCacheProtection: boolean;
};

type ComboEditPayload = {
  name: string;
  strategy: string;
  priority: number;
  models: ComboStep[];
  config: Record<string, unknown>;
  system_message?: string;
  tool_filter_regex?: string;
  context_cache_protection?: boolean;
};

type RoutingStrategyOption = {
  id?: string;
  value?: string;
};

type AdvancedConfig = {
  maxRetries?: number;
  retryDelayMs?: number;
  maxComboDepth?: number;
  timeoutMs?: number;
  concurrencyPerModel?: number;
  queueTimeoutMs?: number;
  handoffThreshold?: number;
  maxMessagesForSummary?: number;
  handoffModel?: string;
  trackMetrics?: boolean;
};

const STRATEGY_GUIDE: Record<string, { title: string; description: string; tips: string[] }> = {
  priority: { title: "Fail-safe baseline", description: "Use one preferred model first, then fail over in order.", tips: ["Best for explicit primary/backup chains", "Keep the stack short", "Use when quality matters more than distribution"] },
  weighted: { title: "Controlled traffic split", description: "Distribute requests by weight for rollout and canary control.", tips: ["Great for gradual migrations", "Keep the total easy to reason about", "Watch success and latency before increasing weight"] },
  "round-robin": { title: "Predictable load sharing", description: "Cycle through equivalent models and accounts in a steady pattern.", tips: ["Best when targets are similar", "Pair with concurrency controls", "Useful for same-model account pools"] },
  "context-relay": { title: "Session continuity", description: "Use fallback with context handoff when account rotation happens.", tips: ["Best for long coding sessions", "Needs strong summary settings", "Use when rotation is expected"] },
  random: { title: "Low-friction spread", description: "Randomize across equivalent targets without strict guarantees.", tips: ["Useful for experimentation", "Keep retries enabled", "Avoid when latency differs a lot"] },
  "least-used": { title: "Adaptive balancing", description: "Bias toward less-used targets to reduce hotspots over time.", tips: ["Works better under sustained traffic", "Good for balancing mixed workloads", "Monitor usage skew"] },
  "cost-optimized": { title: "Budget-first routing", description: "Prefer lower-cost targets when pricing metadata is available.", tips: ["Good for background or batch jobs", "Keep a quality fallback", "Ensure pricing coverage is accurate"] },
  "fill-first": { title: "Quota drain strategy", description: "Exhaust one provider pool before moving to the next.", tips: ["Useful for free-tier stacking", "Order by quota depth", "Enable health checks"] },
  p2c: { title: "Low-latency balancing", description: "Pick the better of two random candidates to improve load behavior.", tips: ["Best with 4+ targets", "Great at higher throughput", "Useful replacement for naive round-robin"] },
  "strict-random": { title: "Fair shuffle deck", description: "Each target is used once per cycle before reshuffling.", tips: ["Best for even spread", "Great for identical accounts", "Avoid if order has semantic meaning"] },
  auto: { title: "Multi-factor intelligence", description: "Score providers using cost, health, latency, and exploration rules.", tips: ["Use candidate pools", "Tune mode packs", "Review provider scoring regularly"] },
  lkgp: { title: "History-driven routing", description: "Prefer providers with stronger recent execution history.", tips: ["Best when telemetry exists", "Stable workloads benefit most", "Use when consistency beats novelty"] },
  "context-optimized": { title: "Context-aware distribution", description: "Prefer targets suited for long context windows and continuity.", tips: ["Best for long-running chats", "Useful when context size differs", "Pair with large-window models"] },
};

function formatStepLabel(step: ComboStep) {
  if (typeof step === "string") return step;
  if (!step || typeof step !== "object") return "";
  if (step.kind === "combo-ref") return `ref:${step.comboName || ""}`;
  return step.model || "";
}

function getStepKey(step: ComboStep) {
  if (typeof step === "string") return step;
  if (!step || typeof step !== "object") return "";
  if (step.kind === "combo-ref") return `ref:${step.comboName || ""}`;
  return [step.model || "", step.connectionId || "__auto__"].join("::");
}

function buildStepObjectFromInput(value: ComboStep): ComboStep | null {
  if (value && typeof value === "object") {
    if (value.kind === "combo-ref") {
      return value.comboName ? { kind: "combo-ref", comboName: value.comboName, label: value.label } : null;
    }
    if (value.model) {
      return { kind: "model", model: value.model, providerId: value.providerId, connectionId: value.connectionId ?? undefined, label: value.label };
    }
  }
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("ref:")) return { kind: "combo-ref", comboName: trimmed.slice(4).trim() };
  return trimmed;
}

function stepBadgeClass(stepLabel: string) {
  return stepLabel.startsWith("ref:")
    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-main)]";
}

function resolveStrategyValue(entry: string | RoutingStrategyOption): string {
  if (typeof entry === "string") return entry;
  return entry.value || entry.id || "round-robin";
}

function WeightTotalBar({ models }: { models: ComboStep[] }) {
  const total = models.length;
  if (total <= 0) return null;
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500"];
  return (
    <div className="mt-1.5">
      <div className="flex h-1.5 overflow-hidden rounded-[4px] bg-black/5 dark:bg-white/5">
        {models.map((_, i) => (
          <div key={i} className={`h-full ${colors[i % colors.length]}`} style={{ width: `${100 / total}%` }} />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
        <span>{models.length} equal steps (each {Math.round(100 / total)}%)</span>
        <span className="font-medium text-[var(--color-text-main)]">100%</span>
      </div>
    </div>
  );
}

function buildInitialDraft(combo: ComboRecord | null | undefined): ComboDraft {
  return {
    id: combo?.id || null,
    name: combo?.name || "",
    strategy: combo?.strategy || "round-robin",
    priority: combo?.priority != null ? String(combo.priority) : "0",
    models: Array.isArray(combo?.models)
      ? combo.models.map((step) => {
          if (!step || typeof step !== "object") return step;
          if (step.kind === "combo-ref") return { kind: "combo-ref", comboName: step.comboName || "", label: step.label };
          return { kind: "model", model: step.model || "", providerId: step.providerId, connectionId: step.connectionId ?? undefined, label: step.label };
        })
      : [],
    config: normalizeIntelligentRoutingConfig(combo?.config || {}),
    systemMessage: combo?.system_message || "",
    toolFilterRegex: combo?.tool_filter_regex || "",
    contextCacheProtection: Boolean(combo?.context_cache_protection),
  };
}

export default function ComboEditModal({
  combo,
  combos,
  activeProviders,
  modelAliases,
  providerModelsByProvider,
  isOpen,
  onClose,
  onSave,
  saving,
  error,
}: {
  combo: ComboRecord | null;
  combos: ComboRecord[];
  activeProviders: ProviderConnectionRecord[];
  modelAliases: Record<string, string>;
  providerModelsByProvider: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (body: ComboEditPayload) => void;
  saving: boolean;
  error: string;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [draft, setDraft] = useState<ComboDraft>(() => buildInitialDraft(combo));
  const isEdit = Boolean(combo?.id);

  const [builderProviderId, setBuilderProviderId] = useState("");
  const [builderModelValue, setBuilderModelValue] = useState("");
  const [builderConnectionId, setBuilderConnectionId] = useState("__auto__");
  const [builderComboRefName, setBuilderComboRefName] = useState("");
  const [stepInput, setStepInput] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const groupedSelectableModels = useMemo(
    () => buildGroupedSelectableModels({ activeProviders, modelAliases, providerModelsByProvider }),
    [activeProviders, modelAliases, providerModelsByProvider]
  );
  const builderProviders = useMemo<BuilderProviderGroup[]>(
    () => Object.entries(groupedSelectableModels).map(([providerId, group]) => ({
      providerId,
      ...(group as Omit<BuilderProviderGroup, "providerId">),
    })),
    [groupedSelectableModels]
  );

  const lastStructuredModelStep = useMemo<ModelStep | null>(() => {
    const step = [...draft.models].reverse().find(
      (entry): entry is ModelStep => typeof entry === "object" && entry !== null && entry.kind === "model"
    );
    return step || null;
  }, [draft.models]);

  const effectiveBuilderProviderId = builderProviderId || lastStructuredModelStep?.providerId || (typeof lastStructuredModelStep?.model === "string" ? lastStructuredModelStep.model.split("/")[0] : "");
  const effectiveBuilderModelValue = builderModelValue || lastStructuredModelStep?.model || "";
  const effectiveBuilderConnectionId = builderConnectionId !== "__auto__" ? builderConnectionId : (lastStructuredModelStep?.connectionId || "__auto__");

  const selectedBuilderProvider = builderProviders.find((p) => p.providerId === effectiveBuilderProviderId) || null;
  const selectedBuilderConnections = useMemo(
    () => activeProviders.filter((connection) => (connection?.provider || connection?.id) === effectiveBuilderProviderId),
    [activeProviders, effectiveBuilderProviderId]
  );
  const builderComboRefs = useMemo(() => combos.filter((c) => c?.id !== combo?.id), [combos, combo]);

  const currentGuide = STRATEGY_GUIDE[draft.strategy] || STRATEGY_GUIDE.priority;
  const advancedConfig = draft.config as AdvancedConfig;

  const pricedModelCount = draft.models.reduce((count: number, modelValue: ComboStep) => {
    const raw = formatStepLabel(modelValue);
    if (!raw || raw.startsWith("ref:")) return count;
    const [provider, ...rest] = raw.split("/");
    const model = rest.join("/");
    return getPricingForModel(provider, model) ? count + 1 : count;
  }, 0);
  const pricingCoveragePercent = draft.models.length > 0 ? Math.round((pricedModelCount / draft.models.length) * 100) : 0;

  const uniqueProviderCount = new Set(
    draft.models
      .map((entry: ComboStep) => formatStepLabel(entry))
      .filter(Boolean)
      .map((entry: string) => (entry.startsWith("ref:") ? null : entry.split("/")[0]))
      .filter(Boolean)
  ).size;

  const comboRefCount = draft.models.filter((entry: ComboStep) => entry && typeof entry === "object" && entry.kind === "combo-ref").length;
  const pinnedAccountCount = draft.models.filter((entry: ComboStep) => entry && typeof entry === "object" && "connectionId" in entry && entry.connectionId).length;

  const moveModel = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= draft.models.length || toIndex >= draft.models.length) return;
    setDraft((current) => {
      const nextModels = [...current.models];
      const [item] = nextModels.splice(fromIndex, 1);
      nextModels.splice(toIndex, 0, item);
      return { ...current, models: nextModels };
    });
  };

  const handleAddBuilderStep = () => {
    if (!effectiveBuilderModelValue || !effectiveBuilderProviderId) return;
    const selectedConnection = effectiveBuilderConnectionId && effectiveBuilderConnectionId !== "__auto__"
      ? selectedBuilderConnections.find((c) => c.id === effectiveBuilderConnectionId) || null
      : null;
    const nextStep: ModelStep = {
      kind: "model",
      model: effectiveBuilderModelValue,
      providerId: effectiveBuilderProviderId,
      connectionId: selectedConnection ? selectedConnection.id : null,
      label: selectedConnection?.label || selectedConnection?.name || undefined,
    };
    if (draft.models.some((entry: ComboStep) => getStepKey(entry) === getStepKey(nextStep))) return;
    setDraft((current) => ({ ...current, models: [...current.models, nextStep] }));
    setBuilderProviderId("");
    setBuilderModelValue("");
    setBuilderConnectionId("__auto__");
  };

  const handleAddManualStep = () => {
    const nextStep = stepInput.trim();
    if (!nextStep || draft.models.some((entry: ComboStep) => getStepKey(entry) === nextStep)) return;
    setDraft((current) => ({ ...current, models: [...current.models, nextStep] }));
    setStepInput("");
  };

  const handleAddComboReference = () => {
    if (!builderComboRefName) return;
    const nextStep: ComboRefStep = { kind: "combo-ref", comboName: builderComboRefName };
    if (draft.models.some((entry: ComboStep) => getStepKey(entry) === getStepKey(nextStep))) return;
    setDraft((current) => ({ ...current, models: [...current.models, nextStep] }));
    setBuilderComboRefName("");
  };

  const handleRemoveModel = (index: number) => {
    setDraft((current) => ({ ...current, models: current.models.filter((_, idx) => idx !== index) }));
  };

  const handleMoveUp = (index: number) => moveModel(index, index - 1);
  const handleMoveDown = (index: number) => moveModel(index, index + 1);

  const handleDragStart = (_event: React.DragEvent<HTMLDivElement>, index: number) => setDragIndex(index);
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, index: number) => { event.preventDefault(); setDragOverIndex(index); };
  const handleDrop = (event: React.DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    if (dragIndex !== null) moveModel(dragIndex, index);
    handleDragEnd();
  };

  const handleSave = () => {
    const body = {
      name: draft.name.trim(),
      strategy: draft.strategy,
      priority: Number(draft.priority) || 0,
      models: draft.models.map(buildStepObjectFromInput).filter(Boolean),
      config: draft.config || {},
      system_message: draft.systemMessage || undefined,
      tool_filter_regex: draft.toolFilterRegex || undefined,
      context_cache_protection: draft.contextCacheProtection || undefined,
    };
    onSave(body);
  };

  const isNameValid = /^[a-zA-Z0-9_.\/-]+$/.test(draft.name.trim());
  const canSave = isNameValid && draft.models.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="flex h-[85vh] w-full max-w-[960px] flex-col rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[4px]" style={{ backgroundColor: "var(--color-primary-soft)" }}>
              <AppIcon name="edit" size={16} style={{ color: "var(--color-primary)" }} />
            </div>
            <div>
              <h3 className="text-base font-semibold" style={{ color: "var(--color-text-main)" }}>{isEdit ? "Edit Combo" : "Create Combo"}</h3>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{isEdit ? combo?.name : "Name it, add models, save."}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 transition-colors cursor-pointer hover:bg-[var(--color-bg-alt)]"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "var(--color-text-main)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "var(--color-text-muted)"; }}
          >
            <AppIcon name="close" size={18} />
          </button>
        </div>

        {/* Tab Navigation - styled like wizard step indicator */}
        <div className="flex border-b border-[var(--color-border)]" style={{ backgroundColor: "var(--color-bg-alt)" }}>
          {TABS.map((tab, index) => {
            const isActive = activeTab === tab.id;
            const isPast = TABS.findIndex((t) => t.id === activeTab) > index;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="group relative flex flex-1 items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition-colors cursor-pointer"
                style={{
                  color: isActive ? "var(--color-primary)" : isPast ? "var(--color-primary)" : "var(--color-text-muted)",
                  backgroundColor: isActive ? "var(--color-surface)" : "transparent",
                }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-[4px] text-[10px] font-semibold"
                  style={{
                    backgroundColor: isActive ? "var(--color-primary)" : isPast ? "var(--color-primary-soft)" : "var(--color-bg-alt)",
                    color: isActive ? "var(--color-text-inverse)" : isPast ? "var(--color-primary)" : "var(--color-text-muted)",
                    border: `1px solid ${isActive ? "var(--color-primary)" : isPast ? "var(--color-primary)" : "var(--color-border-strong)"}`,
                  }}
                >
                  {isPast ? <AppIcon name="check" size={10} /> : index + 1}
                </span>
                <span className="hidden sm:inline">{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: "var(--color-primary)" }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5" style={{ backgroundColor: "var(--color-surface)" }}>
          {error ? (
            <div className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {/* OVERVIEW TAB - combines general info + models */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* Top row: Name/Identity + Summary stats */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
                {/* Left: Identity & Steps */}
                <div className="space-y-4">
                  {/* Identity Card */}
                  <div className="rounded border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                    <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--color-text-main)" }}>Identity</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Combo Name</label>
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
                          placeholder="my-combo"
                          className="w-full rounded border px-3 py-2.5 text-sm transition-colors focus:outline-none"
                          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }}
                        />
                        <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>Letters, numbers, _, -, /, .</p>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Priority</label>
                        <input
                          type="number"
                          value={draft.priority}
                          onChange={(e) => setDraft((c) => ({ ...c, priority: e.target.value }))}
                          placeholder="0"
                          className="w-full rounded border px-3 py-2.5 text-sm transition-colors focus:outline-none"
                          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }}
                        />
                        <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>Higher = checked first</p>
                      </div>
                    </div>
                  </div>

                  {/* Add Steps */}
                  <div className="rounded border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Add model step</label>
                        <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Choose provider, then model. Account stays automatic unless pinned.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
                      <select
                        value={effectiveBuilderProviderId}
                        onChange={(e) => { setBuilderProviderId(e.target.value); setBuilderModelValue(""); setBuilderConnectionId("__auto__"); }}
                        className="w-full cursor-pointer rounded border px-3 py-2 text-xs transition-colors focus:outline-none"
                        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }}
                      >
                        <option value="">Provider</option>
                        {builderProviders.map((provider) => (
                          <option key={provider.providerId} value={provider.providerId}>{provider.name}</option>
                        ))}
                      </select>
                      <select
                        value={effectiveBuilderModelValue}
                        onChange={(e) => setBuilderModelValue(e.target.value)}
                        disabled={!selectedBuilderProvider}
                        className="w-full cursor-pointer rounded border px-3 py-2 text-xs transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }}
                      >
                        <option value="">{selectedBuilderProvider ? "Model" : "Select provider"}</option>
                        {(selectedBuilderProvider?.models || []).map((model) => (
                          <option key={model.value} value={model.value}>{model.name}{model.isCustom ? " · custom" : ""}</option>
                        ))}
                      </select>
                      <select
                        value={effectiveBuilderConnectionId}
                        onChange={(e) => setBuilderConnectionId(e.target.value)}
                        disabled={!effectiveBuilderModelValue}
                        className="w-full cursor-pointer rounded border px-3 py-2 text-xs transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }}
                      >
                        <option value="__auto__">Auto account</option>
                        {selectedBuilderConnections.map((connection) => (
                          <option key={connection.id} value={connection.id}>{connection.label || connection.name || connection.id}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleAddBuilderStep}
                        disabled={!effectiveBuilderModelValue}
                        className="rounded px-3 py-2 text-xs font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        style={{ backgroundColor: "var(--color-primary)" }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Combo Reference + Manual */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded border p-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Reference another combo</label>
                      <div className="flex gap-2">
                        <select
                          value={builderComboRefName}
                          onChange={(e) => setBuilderComboRefName(e.target.value)}
                          className="min-w-0 flex-1 cursor-pointer rounded border px-2 py-1.5 text-xs"
                          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }}
                        >
                          <option value="">Select combo</option>
                          {builderComboRefs.map((comboRef) => (
                            <option key={comboRef.id} value={comboRef.name}>{comboRef.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleAddComboReference}
                          disabled={!builderComboRefName}
                          className="shrink-0 rounded border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                    <details className="rounded border p-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                      <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Manual input</summary>
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={stepInput}
                          onChange={(e) => setStepInput(e.target.value)}
                          placeholder="provider/model"
                          className="min-w-0 flex-1 rounded border px-2 py-1.5 text-xs"
                          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }}
                        />
                        <button
                          onClick={handleAddManualStep}
                          className="shrink-0 rounded border px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                        >
                          Add
                        </button>
                      </div>
                    </details>
                  </div>

                  {/* Steps List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Steps ({draft.models.length})</label>
                      {draft.strategy === "weighted" && <WeightTotalBar models={draft.models} />}
                    </div>
                    {draft.models.length === 0 ? (
                      <div className="rounded border border-dashed py-6 text-center" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                        <AppIcon name="layers" size={20} className="mx-auto mb-2" style={{ color: "var(--color-text-muted)" }} />
                        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No steps yet. Add models above.</p>
                      </div>
                    ) : (
                      draft.models.map((m, i) => {
                        const raw = formatStepLabel(m);
                        const isDropTarget = dragOverIndex === i && dragIndex !== i;
                        return (
                          <div
                            key={`${getStepKey(m)}-${i}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, i)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => handleDragOver(e, i)}
                            onDrop={(e) => handleDrop(e, i)}
                            className={`flex items-center gap-2 rounded border px-3 py-2.5 transition-colors ${dragIndex === i ? "opacity-50" : ""}`}
                            style={{
                              borderColor: isDropTarget ? "var(--color-primary)" : "var(--color-border)",
                              backgroundColor: isDropTarget ? "var(--color-primary-soft)" : "var(--color-surface)",
                            }}
                          >
                            <AppIcon name="drag_indicator" size={14} style={{ color: "var(--color-text-muted)" }} />
                            <span className="w-4 text-center text-[10px] font-medium" style={{ color: "var(--color-text-muted)" }}>{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm" style={{ color: "var(--color-text-main)" }}>{raw}</div>
                              {m && typeof m === "object" && "connectionId" in m && m.connectionId ? (
                                <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Pinned: {m.label || m.connectionId}</div>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-0.5">
                              <button type="button" onClick={() => handleMoveUp(i)} disabled={i === 0} className="rounded p-1 disabled:opacity-20 cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
                                <AppIcon name="arrow_upward" size={12} />
                              </button>
                              <button type="button" onClick={() => handleMoveDown(i)} disabled={i === draft.models.length - 1} className="rounded p-1 disabled:opacity-20 cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
                                <AppIcon name="arrow_downward" size={12} />
                              </button>
                              <button type="button" onClick={() => handleRemoveModel(i)} className="rounded p-1 cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
                                <AppIcon name="close" size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {draft.strategy === "cost-optimized" && draft.models.length > 0 && (
                    <div className="rounded border px-3 py-2" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span style={{ color: "var(--color-text-muted)" }}>Pricing coverage</span>
                        <span className="font-medium" style={{ color: "var(--color-text-main)" }}>{pricedModelCount}/{draft.models.length} ({pricingCoveragePercent}%)</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-border-strong)" }}>
                        <div className="h-full" style={{ width: `${pricingCoveragePercent}%`, backgroundColor: pricingCoveragePercent === 100 ? "var(--color-success)" : pricingCoveragePercent > 0 ? "var(--color-warning)" : "var(--color-danger)" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Summary sidebar */}
                <div className="space-y-3">
                  <div className="rounded border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                    <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--color-text-main)" }}>Combo Stats</h4>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Strategy</span>
                        <span className="rounded px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "var(--color-primary-soft)", color: "var(--color-primary)" }}>{draft.strategy}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Steps</span>
                        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-main)" }}>{draft.models.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Providers</span>
                        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-main)" }}>{uniqueProviderCount}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Combo refs</span>
                        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-main)" }}>{comboRefCount}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Pinned accounts</span>
                        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-main)" }}>{pinnedAccountCount}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Priority</span>
                        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-main)" }}>{draft.priority}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick strategy change */}
                  <div className="rounded border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                    <h4 className="mb-2 text-xs font-semibold" style={{ color: "var(--color-text-main)" }}>Quick Strategy</h4>
                    <select
                      value={draft.strategy}
                      onChange={(e) =>
                        setDraft((c) => ({
                          ...c,
                          strategy: e.target.value,
                          config: isIntelligentStrategy(e.target.value) ? normalizeIntelligentRoutingConfig(c.config) : c.config,
                        }))
                      }
                      className="w-full cursor-pointer rounded border px-2 py-1.5 text-xs"
                      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }}
                    >
                      {ROUTING_STRATEGIES.map((entry: string | RoutingStrategyOption) => {
                        const value = resolveStrategyValue(entry);
                        return <option key={value} value={value}>{value}</option>;
                      })}
                    </select>
                    <p className="mt-2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>{currentGuide.description}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STRATEGY TAB */}
          {activeTab === "strategy" && (
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="rounded border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                <label className="mb-3 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Routing Strategy</label>
                <div className="flex flex-wrap gap-2">
                  {ROUTING_STRATEGIES.map((entry: string | RoutingStrategyOption) => {
                    const value = resolveStrategyValue(entry);
                    const isActive = draft.strategy === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setDraft((c) => ({
                            ...c,
                            strategy: value,
                            config: isIntelligentStrategy(value) ? normalizeIntelligentRoutingConfig(c.config) : c.config,
                          }))
                        }
                        className="rounded px-3 py-2 text-xs transition-all cursor-pointer"
                        style={{
                          border: `1px solid ${isActive ? "var(--color-primary)" : "var(--color-border)"}`,
                          backgroundColor: isActive ? "var(--color-primary)" : "transparent",
                          color: isActive ? "var(--color-text-inverse)" : "var(--color-text-muted)",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            (e.target as HTMLElement).style.borderColor = "var(--color-primary)";
                            (e.target as HTMLElement).style.color = "var(--color-primary)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            (e.target as HTMLElement).style.borderColor = "var(--color-border)";
                            (e.target as HTMLElement).style.color = "var(--color-text-muted)";
                          }
                        }}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Strategy Guide Card */}
              <div className="rounded border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded" style={{ backgroundColor: "var(--color-primary-soft)" }}>
                    <AppIcon name="lightbulb" size={16} style={{ color: "var(--color-primary)" }} />
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold" style={{ color: "var(--color-text-main)" }}>{currentGuide.title}</h5>
                    <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{currentGuide.description}</p>
                    <ul className="mt-2 space-y-1">
                      {currentGuide.tips.map((tip: string) => (
                        <li key={tip} className="flex items-start gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          <AppIcon name="check_circle" size={12} className="mt-0.5 shrink-0" style={{ color: "var(--color-primary)" }} />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {isIntelligentStrategy(draft.strategy) && (
                <div className="rounded border p-4" style={{ borderColor: "var(--color-primary-soft)", backgroundColor: "var(--color-primary-soft)" }}>
                  <BuilderIntelligentStep
                    config={draft.config}
                    onChange={(nextConfig: Record<string, unknown>) => setDraft((c) => ({ ...c, config: nextConfig }))}
                    activeProviders={activeProviders}
                  />
                </div>
              )}
            </div>
          )}

          {/* ADVANCED TAB */}
          {activeTab === "advanced" && (
            <div className="mx-auto max-w-2xl space-y-4">
              {/* Execution Limits */}
              <div className="rounded border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--color-text-main)" }}>Execution Limits</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Max retries</label>
                    <input type="number" min={0} max={10} value={advancedConfig?.maxRetries ?? ""} placeholder="1"
                      onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, maxRetries: e.target.value ? Number(e.target.value) : undefined } }))}
                      className="w-full rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Retry delay (ms)</label>
                    <input type="number" min={0} max={60000} step={500} value={advancedConfig?.retryDelayMs ?? ""} placeholder="2000"
                      onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, retryDelayMs: e.target.value ? Number(e.target.value) : undefined } }))}
                      className="w-full rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Max combo depth</label>
                    <input type="number" min={1} max={10} value={advancedConfig?.maxComboDepth ?? ""} placeholder="3"
                      onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, maxComboDepth: e.target.value ? Number(e.target.value) : undefined } }))}
                      className="w-full rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Timeout (ms)</label>
                    <input type="number" min={5000} max={300000} step={1000} value={advancedConfig?.timeoutMs ?? ""} placeholder="60000"
                      onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, timeoutMs: e.target.value ? Number(e.target.value) : undefined } }))}
                      className="w-full rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                  </div>
                </div>
              </div>

              {/* Strategy-specific */}
              {draft.strategy === "round-robin" && (
                <div className="rounded border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                  <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--color-text-main)" }}>Round-Robin Settings</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Concurrency per model</label>
                      <input type="number" min={1} max={20} value={advancedConfig?.concurrencyPerModel ?? ""} placeholder="3"
                        onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, concurrencyPerModel: e.target.value ? Number(e.target.value) : undefined } }))}
                        className="w-full rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Queue timeout (ms)</label>
                      <input type="number" min={1000} max={120000} step={1000} value={advancedConfig?.queueTimeoutMs ?? ""} placeholder="30000"
                        onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, queueTimeoutMs: e.target.value ? Number(e.target.value) : undefined } }))}
                        className="w-full rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                    </div>
                  </div>
                </div>
              )}

              {draft.strategy === "context-relay" && (
                <div className="rounded border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                  <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--color-text-main)" }}>Context Relay Settings</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Handoff threshold</label>
                      <input type="number" min={0.5} max={0.94} step={0.01} value={advancedConfig?.handoffThreshold ?? ""} placeholder="0.85"
                        onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, handoffThreshold: e.target.value ? Number(e.target.value) : undefined } }))}
                        className="w-full rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Max messages</label>
                      <input type="number" min={5} max={100} value={advancedConfig?.maxMessagesForSummary ?? ""} placeholder="30"
                        onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, maxMessagesForSummary: e.target.value ? Number(e.target.value) : undefined } }))}
                        className="w-full rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Handoff model</label>
                      <input type="text" value={advancedConfig?.handoffModel ?? ""} placeholder="codex/gpt-5.4"
                        onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, handoffModel: e.target.value || undefined } }))}
                        className="w-full rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Agent Features */}
              <div className="rounded border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-text-main)" }}>
                  <AppIcon name="smart_toy" size={16} style={{ color: "var(--color-primary)" }} />
                  Agent Features
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>System message override</label>
                    <textarea rows={2} value={draft.systemMessage || ""} onChange={(e) => setDraft((c) => ({ ...c, systemMessage: e.target.value }))}
                      placeholder="Optional system instructions" className="w-full resize-none rounded border px-3 py-2 text-xs"
                      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Tool filter regex</label>
                    <input type="text" value={draft.toolFilterRegex || ""} onChange={(e) => setDraft((c) => ({ ...c, toolFilterRegex: e.target.value }))}
                      placeholder="e.g. ^(bash|computer)$" className="w-full rounded border px-3 py-2 text-xs"
                      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-text-main)" }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center justify-between gap-2 cursor-pointer rounded border px-3 py-2" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                      <span className="text-[11px] font-medium" style={{ color: "var(--color-text-main)" }}>Cache protection</span>
                      <Switch checked={Boolean(draft.contextCacheProtection)} onToggle={() => setDraft((c) => ({ ...c, contextCacheProtection: !c.contextCacheProtection }))} />
                    </label>
                    <label className="flex items-center justify-between gap-2 cursor-pointer rounded border px-3 py-2" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                      <span className="text-[11px] font-medium" style={{ color: "var(--color-text-main)" }}>Track metrics</span>
                      <Switch checked={Boolean(advancedConfig?.trackMetrics !== false)} onToggle={() => setDraft((c) => ({ ...c, config: { ...c.config, trackMetrics: !(advancedConfig?.trackMetrics !== false) } }))} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-alt)" }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
            <span>{draft.models.length} step{draft.models.length !== 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{draft.strategy}</span>
            <span>·</span>
            <span>priority {draft.priority}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSave}>
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Combo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import AppIcon from "@/shared/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ModelSelectModal } from "@/shared/components";
import { ROUTING_STRATEGIES } from "@/shared/constants/routingStrategies";
import {
  isIntelligentStrategy,
  normalizeIntelligentRoutingConfig,
} from "@/lib/combos/intelligentRouting";
import BuilderIntelligentStep from "../BuilderIntelligentStep";

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

function buildInitialDraft(combo: ComboRecord | null | undefined): ComboDraft {
  return {
    id: combo?.id || null,
    name: combo?.name || "",
    strategy: combo?.strategy || "priority",
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
  activeProviders,
  modelAliases,
  isOpen,
  onClose,
  onSave,
  saving,
  error,
}: {
  combo: ComboRecord | null;
  activeProviders: ProviderConnectionRecord[];
  modelAliases: Record<string, string>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (body: ComboEditPayload) => void;
  saving: boolean;
  error: string;
}) {
  const [draft, setDraft] = useState<ComboDraft>(() => buildInitialDraft(combo));
  const [showModelSelect, setShowModelSelect] = useState(false);

  const [stepInput, setStepInput] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(buildInitialDraft(combo));
    setStepInput("");
    setDragIndex(null);
    setDragOverIndex(null);
    setShowModelSelect(false);
  }, [combo?.id, isOpen]);

  const moveModel = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= draft.models.length || toIndex >= draft.models.length) return;
    setDraft((current) => {
      const nextModels = [...current.models];
      const [item] = nextModels.splice(fromIndex, 1);
      nextModels.splice(toIndex, 0, item);
      return { ...current, models: nextModels };
    });
  };

  const handleAddSelectedModel = (model: { value: string }) => {
    const nextStep = model.value;
    if (!nextStep || draft.models.some((entry: ComboStep) => getStepKey(entry) === nextStep)) return;
    setDraft((current) => ({ ...current, models: [...current.models, nextStep] }));
  };

  const handleAddManualStep = () => {
    const nextStep = stepInput.trim();
    if (!nextStep || draft.models.some((entry: ComboStep) => getStepKey(entry) === nextStep)) return;
    setDraft((current) => ({ ...current, models: [...current.models, nextStep] }));
    setStepInput("");
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
    const body: ComboEditPayload = {
      name: draft.name.trim(),
      strategy: draft.strategy,
      priority: Number(draft.priority) || 0,
      models: draft.models
        .map(buildStepObjectFromInput)
        .filter((step): step is ComboStep => Boolean(step)),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--color-text-main)" }}>Edit Combo</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Simple fields, direct model list, no tabs.</p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-alt)] hover:text-[var(--color-text-main)]">
            <AppIcon name="close" size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error ? <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Combo name</label>
              <Input value={draft.name} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} placeholder="my-combo" />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Priority</label>
              <Input type="number" value={draft.priority} onChange={(e) => setDraft((c) => ({ ...c, priority: e.target.value }))} placeholder="0" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Strategy</label>
            <select
              value={draft.strategy}
              onChange={(e) => setDraft((c) => ({ ...c, strategy: e.target.value, config: isIntelligentStrategy(e.target.value) ? normalizeIntelligentRoutingConfig(c.config) : c.config }))}
              className="w-full cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text-main)] focus:outline-none"
            >
              {ROUTING_STRATEGIES.map((entry: string | RoutingStrategyOption) => {
                const value = resolveStrategyValue(entry);
                return <option key={value} value={value}>{value}</option>;
              })}
            </select>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{(STRATEGY_GUIDE[draft.strategy] || STRATEGY_GUIDE.priority).description}</p>
          </div>

          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-main)" }}>Models</h4>
                <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Add via Pick Models modal or manual input only.</p>
              </div>
              <Button type="button" onClick={() => setShowModelSelect(true)}>Pick Models</Button>
            </div>

            <details className="mb-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Manual input</summary>
              <div className="mt-2 flex gap-2">
                <Input value={stepInput} onChange={(e) => setStepInput(e.target.value)} placeholder="provider/model or ref:combo-name" />
                <Button type="button" variant="outline" onClick={handleAddManualStep}>Add</Button>
              </div>
            </details>

            <div className="space-y-2">
              {draft.models.length === 0 ? (
                <div className="rounded border border-dashed border-[var(--color-border)] py-6 text-center text-xs text-[var(--color-text-muted)]">No models yet.</div>
              ) : draft.models.map((m, i) => {
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
                    className="flex items-center gap-2 rounded border px-3 py-2"
                    style={{ borderColor: isDropTarget ? "var(--color-primary)" : "var(--color-border)", backgroundColor: isDropTarget ? "var(--color-primary-soft)" : "var(--color-surface)" }}
                  >
                    <AppIcon name="drag_indicator" size={14} style={{ color: "var(--color-text-muted)" }} />
                    <span className="w-5 text-center text-[10px]" style={{ color: "var(--color-text-muted)" }}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-text-main)" }}>{raw}</span>
                    <button type="button" onClick={() => handleMoveUp(i)} disabled={i === 0} className="rounded p-1 disabled:opacity-20" style={{ color: "var(--color-text-muted)" }}><AppIcon name="arrow_upward" size={12} /></button>
                    <button type="button" onClick={() => handleMoveDown(i)} disabled={i === draft.models.length - 1} className="rounded p-1 disabled:opacity-20" style={{ color: "var(--color-text-muted)" }}><AppIcon name="arrow_downward" size={12} /></button>
                    <button type="button" onClick={() => handleRemoveModel(i)} className="rounded p-1" style={{ color: "var(--color-text-muted)" }}><AppIcon name="close" size={12} /></button>
                  </div>
                );
              })}
            </div>
          </div>

          {isIntelligentStrategy(draft.strategy) ? (
            <details className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-4">
              <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--color-text-main)" }}>Intelligent routing settings</summary>
              <div className="mt-3">
                <BuilderIntelligentStep config={draft.config} onChange={(nextConfig: Record<string, unknown>) => setDraft((c) => ({ ...c, config: nextConfig }))} activeProviders={activeProviders} />
              </div>
            </details>
          ) : null}

          <details className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-4">
            <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--color-text-main)" }}>Advanced settings</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input type="number" min={0} max={10} value={advancedConfig?.maxRetries ?? ""} placeholder="Max retries" onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, maxRetries: e.target.value ? Number(e.target.value) : undefined } }))} />
              <Input type="number" min={5000} max={300000} step={1000} value={advancedConfig?.timeoutMs ?? ""} placeholder="Timeout (ms)" onChange={(e) => setDraft((c) => ({ ...c, config: { ...c.config, timeoutMs: e.target.value ? Number(e.target.value) : undefined } }))} />
              <textarea rows={2} value={draft.systemMessage || ""} onChange={(e) => setDraft((c) => ({ ...c, systemMessage: e.target.value }))} placeholder="Optional system message" className="rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-main)] sm:col-span-2" />
              <Input value={draft.toolFilterRegex || ""} onChange={(e) => setDraft((c) => ({ ...c, toolFilterRegex: e.target.value }))} placeholder="Tool filter regex" />
              <label className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs" style={{ color: "var(--color-text-main)" }}>
                Cache protection
                <Switch checked={Boolean(draft.contextCacheProtection)} onToggle={() => setDraft((c) => ({ ...c, contextCacheProtection: !c.contextCacheProtection }))} />
              </label>
            </div>
          </details>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-bg-alt)] px-5 py-3">
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{draft.models.length} model{draft.models.length !== 1 ? "s" : ""}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !canSave}>{saving ? "Saving..." : "Save Changes"}</Button>
          </div>
        </div>
      </div>

      <ModelSelectModal
        isOpen={showModelSelect}
        onClose={() => setShowModelSelect(false)}
        onSelect={handleAddSelectedModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Pick Models"
        comboSelectMode="ref"
      />
    </div>
  );
}

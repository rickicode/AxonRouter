"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ModelSelectModal } from "@/shared/components";
import CombosHeader from "./components/CombosHeader";
import ComboCard from "./components/ComboCard";
import ComboTestResultsModal from "./components/ComboTestResultsModal";
import ComboEditModal from "./components/ComboEditModal";
import BuilderBasicsStage from "./components/BuilderBasicsStage";
import BuilderStepsStage from "./components/BuilderStepsStage";
import BuilderStrategyStage from "./components/BuilderStrategyStage";
import BuilderReviewStage from "./components/BuilderReviewStage";
import BuilderIntelligentStage from "./components/BuilderIntelligentStage";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { fetchJson, queryKeys } from "@/shared/query";
import { ROUTING_STRATEGIES } from "@/shared/constants/routingStrategies";
import BuilderIntelligentStep from "./BuilderIntelligentStep";
import IntelligentComboPanel from "./IntelligentComboPanel";
import {
  filterCombosByStrategyCategory,
  isIntelligentStrategy,
  normalizeIntelligentRoutingFilter,
  normalizeIntelligentRoutingConfig,
} from "@/lib/combos/intelligentRouting";
import { getPricingForModel } from "@/shared/constants/pricing";
import { buildGroupedSelectableModels } from "@/lib/opencodeSync/modelSelectOptions";

type ComboRecord = {
  id?: string;
  name?: string;
  strategy?: string;
  priority?: number;
  models?: any[];
  config?: Record<string, unknown>;
  isHidden?: boolean;
  [key: string]: unknown;
};

type ProviderConnectionRecord = {
  id?: string;
  provider?: string;
  label?: string;
  name?: string;
  [key: string]: unknown;
};

type ComboMappingRecord = {
  id?: string;
  comboId?: string;
  comboName?: string;
  pattern?: string;
  priority?: number;
  enabled?: boolean;
  description?: string;
  [key: string]: unknown;
};

type CombosQueryResponse = { combos?: ComboRecord[] };
type ProvidersQueryResponse = { connections?: ProviderConnectionRecord[] };
type MappingsQueryResponse = { mappings?: ComboMappingRecord[] };

const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\/-]+$/;
const BUILDER_STAGES = ["basics", "steps", "strategy", "intelligent", "review"];

const STAGE_META = {
  basics: {
    title: "Basics",
    description: "Define the combo identity and baseline routing priority.",
    icon: "looks_one",
  },
  steps: {
    title: "Models",
    description: "Compose providers, models, or nested combo references in execution order.",
    icon: "looks_two",
  },
  strategy: {
    title: "Strategy",
    description: "Choose routing behavior and tune the execution policy.",
    icon: "looks_3",
  },
  intelligent: {
    title: "Intelligent",
    description: "Configure candidate pools, scoring, exploration, and mode packs.",
    icon: "auto_awesome",
  },
  review: {
    title: "Review",
    description: "Validate the final combo before it becomes live.",
    icon: "fact_check",
  },
};

const STRATEGY_GUIDE = {
  priority: {
    title: "Fail-safe baseline",
    description: "Use one preferred model first, then fail over in order.",
    tips: ["Best for explicit primary/backup chains", "Keep the stack short", "Use when quality matters more than distribution"],
  },
  weighted: {
    title: "Controlled traffic split",
    description: "Distribute requests by weight for rollout and canary control.",
    tips: ["Great for gradual migrations", "Keep the total easy to reason about", "Watch success and latency before increasing weight"],
  },
  "round-robin": {
    title: "Predictable load sharing",
    description: "Cycle through equivalent models and accounts in a steady pattern.",
    tips: ["Best when targets are similar", "Pair with concurrency controls", "Useful for same-model account pools"],
  },
  "context-relay": {
    title: "Session continuity",
    description: "Use fallback with context handoff when account rotation happens.",
    tips: ["Best for long coding sessions", "Needs strong summary settings", "Use when rotation is expected"],
  },
  random: {
    title: "Low-friction spread",
    description: "Randomize across equivalent targets without strict guarantees.",
    tips: ["Useful for experimentation", "Keep retries enabled", "Avoid when latency differs a lot"],
  },
  "least-used": {
    title: "Adaptive balancing",
    description: "Bias toward less-used targets to reduce hotspots over time.",
    tips: ["Works better under sustained traffic", "Good for balancing mixed workloads", "Monitor usage skew"],
  },
  "cost-optimized": {
    title: "Budget-first routing",
    description: "Prefer lower-cost targets when pricing metadata is available.",
    tips: ["Good for background or batch jobs", "Keep a quality fallback", "Ensure pricing coverage is accurate"],
  },
  "fill-first": {
    title: "Quota drain strategy",
    description: "Exhaust one provider pool before moving to the next.",
    tips: ["Useful for free-tier stacking", "Order by quota depth", "Enable health checks"],
  },
  p2c: {
    title: "Low-latency balancing",
    description: "Pick the better of two random candidates to improve load behavior.",
    tips: ["Best with 4+ targets", "Great at higher throughput", "Useful replacement for naive round-robin"],
  },
  "strict-random": {
    title: "Fair shuffle deck",
    description: "Each target is used once per cycle before reshuffling.",
    tips: ["Best for even spread", "Great for identical accounts", "Avoid if order has semantic meaning"],
  },
  auto: {
    title: "Multi-factor intelligence",
    description: "Score providers using cost, health, latency, and exploration rules.",
    tips: ["Use candidate pools", "Tune mode packs", "Review provider scoring regularly"],
  },
  lkgp: {
    title: "History-driven routing",
    description: "Prefer providers with stronger recent execution history.",
    tips: ["Best when telemetry exists", "Stable workloads benefit most", "Use when consistency beats novelty"],
  },
  "context-optimized": {
    title: "Context-aware distribution",
    description: "Prefer targets suited for long context windows and continuity.",
    tips: ["Best for long-running chats", "Useful when context size differs", "Pair with large-window models"],
  },
};

const I18N_FALLBACK = {
  createCombo: "Create Combo",
  editCombo: "Edit Combo",
  basics: "Basics",
  steps: "Steps",
  strategy: "Strategy",
  intelligent: "Intelligent",
  review: "Review",
  nextStage: "Next",
  previousStage: "Previous",
  save: "Save",
  cancel: "Cancel",
  addStep: "Add Step",
  pickModel: "Pick Model",
  pricingCoverage: "Pricing coverage",
  pricingAvailable: "Pricing available",
  pricingMissing: "No pricing",
  costOptimizedHint: "Cost-optimized works best when all combo models have pricing.",
  reviewTitle: "Review combo",
  reviewName: "Name",
  reviewStrategy: "Strategy",
  reviewSteps: "Steps",
  reviewProviders: "Providers",
  advancedSettings: "Advanced settings",
  maxRetries: "Max retries",
  retryDelay: "Retry delay (ms)",
  concurrencyPerModel: "Concurrency per model",
  queueTimeout: "Queue timeout (ms)",
  handoffThreshold: "Handoff threshold",
  maxMessagesForSummary: "Max messages for summary",
  handoffModel: "Summary model",
  agentFeatures: "Agent features",
  systemMessage: "System message override",
  toolFilterRegex: "Tool filter regex",
  contextCacheProtection: "Context cache protection",
};

function t(key, fallback = "") {
  return I18N_FALLBACK[key] || fallback || key;
}

function formatStepLabel(step) {
  if (typeof step === "string") return step;
  if (!step || typeof step !== "object") return "";
  if (step.kind === "combo-ref") return `ref:${step.comboName || ""}`;
  return step.model || "";
}

function getStepKey(step) {
  if (typeof step === "string") return step;
  if (!step || typeof step !== "object") return "";
  if (step.kind === "combo-ref") return `ref:${step.comboName || ""}`;
  return [step.model || "", step.connectionId || "__auto__"].join("::");
}

function getVisibleStages(strategy) {
  return isIntelligentStrategy(strategy)
    ? [...BUILDER_STAGES]
    : BUILDER_STAGES.filter((stage) => stage !== "intelligent");
}

function buildStepObjectFromInput(value) {
  if (value && typeof value === "object") {
    if (value.kind === "combo-ref") {
      return value.comboName ? { kind: "combo-ref", comboName: value.comboName, label: value.label } : null;
    }
    if (value.model) {
      return {
        kind: "model",
        model: value.model,
        providerId: value.providerId,
        connectionId: value.connectionId ?? undefined,
        label: value.label,
      };
    }
  }

  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("ref:")) {
    return { kind: "combo-ref", comboName: trimmed.slice(4).trim() };
  }
  return trimmed;
}

function buildInitialDraft(combo = null) {
  return {
    id: combo?.id || null,
    name: combo?.name || "",
    strategy: combo?.strategy || "priority",
    priority: combo?.priority != null ? String(combo.priority) : "0",
    models: Array.isArray(combo?.models)
      ? combo.models.map((step) => {
          if (!step || typeof step !== "object") return step;
          if (step.kind === "combo-ref") {
            return {
              kind: "combo-ref",
              comboName: step.comboName || "",
              label: step.label,
            };
          }
          return {
            kind: "model",
            model: step.model || "",
            providerId: step.providerId,
            connectionId: step.connectionId ?? undefined,
            label: step.label,
          };
        })
      : [],
    config: normalizeIntelligentRoutingConfig(combo?.config || {}),
    systemMessage: combo?.system_message || "",
    toolFilterRegex: combo?.tool_filter_regex || "",
    contextCacheProtection: Boolean(combo?.context_cache_protection),
  };
}

function stageComplete(stage, draft) {
  if (stage === "basics") return Boolean(draft.name.trim() && VALID_NAME_REGEX.test(draft.name));
  if (stage === "steps") return draft.models.length > 0;
  if (stage === "strategy") return Boolean(draft.strategy); // Has default "priority", always true
  if (stage === "intelligent") return !isIntelligentStrategy(draft.strategy) || true;
  if (stage === "review") return stageComplete("basics", draft) && stageComplete("steps", draft);
  return false;
}

function stepBadgeClass(step) {
  return step.startsWith("ref:")
    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "border-[var(--color-border)] bg-[var(--color-surface)] text-text-main";
}

function WeightTotalBar({ models }) {
  const total = models.length;
  const isValid = total > 0;
  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-purple-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-orange-500",
    "bg-indigo-500",
  ];

  if (!isValid) return null;

  return (
    <div className="mt-1.5">
      <div className="h-1.5 rounded-[4px] bg-black/5 dark:bg-white/5 overflow-hidden flex">
        {models.map((_, i) => (
          <div
            key={i}
            className={`h-full ${colors[i % colors.length]}`}
            style={{ width: `${100 / total}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
        <span>{models.length} equal steps (each {Math.round(100 / total)}%)</span>
        <span className="font-medium text-text-main">100%</span>
      </div>
    </div>
  );
}


export default function CombosPage() {
  const queryClient = useQueryClient();
  const combosQuery = useQuery({
    queryKey: queryKeys.combos(),
    queryFn: ({ signal }) => fetchJson<CombosQueryResponse>("/api/combos", { signal }),
  });
  const providersQuery = useQuery({
    queryKey: queryKeys.providers(),
    queryFn: ({ signal }) => fetchJson<ProvidersQueryResponse>("/api/providers", { signal }),
  });
  const mappingsQuery = useQuery({
    queryKey: queryKeys.modelComboMappings(),
    queryFn: ({ signal }) => fetchJson<MappingsQueryResponse>("/api/model-combo-mappings", { signal }),
  });

  const combos = useMemo(() => combosQuery.data?.combos || [], [combosQuery.data?.combos]);
  const activeProviders = useMemo(() => providersQuery.data?.connections || [], [providersQuery.data?.connections]);
  const mappings = useMemo(() => mappingsQuery.data?.mappings || [], [mappingsQuery.data?.mappings]);

  const [search, setSearch] = useState("");
  const [strategyFilter, setStrategyFilter] = useState("all");
  const [editingCombo, setEditingCombo] = useState(null);
  const [draft, setDraft] = useState(() => buildInitialDraft());
  const [stage, setStage] = useState("basics");
  const [showModelSelect, setShowModelSelect] = useState(false);

  const [stepInput, setStepInput] = useState("");
  const [saving, setSaving] = useState(false);
  const { copied, copy } = useCopyToClipboard();
  const [mappingDraft, setMappingDraft] = useState({ id: null, pattern: "", comboId: "", priority: "0", enabled: true, description: "" });
  const [showMappingEditor, setShowMappingEditor] = useState(false);
  const [comboEditorError, setComboEditorError] = useState("");
  const [mappingEditorError, setMappingEditorError] = useState("");
  const [showComboEditor, setShowComboEditor] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [recentlyCreatedCombo, setRecentlyCreatedCombo] = useState("");
  const [testingCombo, setTestingCombo] = useState("");
  const [testResults, setTestResults] = useState(null);
  const [isExpertMode, setIsExpertMode] = useState(false);
  const [selectedIntelligentComboId, setSelectedIntelligentComboId] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [builderProviderId, setBuilderProviderId] = useState("");
  const [builderModelValue, setBuilderModelValue] = useState("");
  const [builderConnectionId, setBuilderConnectionId] = useState("__auto__");
  const [builderComboRefName, setBuilderComboRefName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const normalizedFilter = normalizeIntelligentRoutingFilter(strategyFilter);

  const intelligentCombos = useMemo(
    () => combos.filter((combo) => isIntelligentStrategy(combo?.strategy)),
    [combos]
  );

  const selectedIntelligentCombo = useMemo(() => {
    if (normalizedFilter !== "intelligent") return null;
    if (!selectedIntelligentComboId) return intelligentCombos[0] || null;
    return intelligentCombos.find((combo) => combo.id === selectedIntelligentComboId) || intelligentCombos[0] || null;
  }, [selectedIntelligentComboId, intelligentCombos, normalizedFilter]);

  const modelAliasesQuery = useQuery({
    queryKey: queryKeys.modelAliases(),
    queryFn: ({ signal }) => fetchJson<{ aliases?: Record<string, string> }>("/api/models/alias", { signal }),
  });

  const providerModelsQuery = useQuery({
    queryKey: queryKeys.providerModels(),
    queryFn: ({ signal }) => fetchJson<{ models?: Record<string, unknown> }>("/api/provider-models", { signal }),
  });

  const modelAliases = useMemo(() => modelAliasesQuery.data?.aliases || {}, [modelAliasesQuery.data]);
  const providerModelsByProvider = useMemo(() => providerModelsQuery.data?.models || {}, [providerModelsQuery.data]);

  const visibleCombos = useMemo(() => {
    const byCategory = filterCombosByStrategyCategory(combos, normalizedFilter);
    if (!search.trim()) return byCategory;
    const q = search.toLowerCase();
    return byCategory.filter((combo) => {
      const name = String(combo?.name || "").toLowerCase();
      const strategy = String(combo?.strategy || "priority").toLowerCase();
      return name.includes(q) || strategy.includes(q);
    });
  }, [combos, normalizedFilter, search]);

  const visibleStages = getVisibleStages(draft.strategy);
  const currentGuide = STRATEGY_GUIDE[draft.strategy] || STRATEGY_GUIDE.priority;
  const groupedSelectableModels = useMemo(
    () => buildGroupedSelectableModels({ activeProviders, modelAliases, providerModelsByProvider }),
    [activeProviders, modelAliases, providerModelsByProvider]
  );
  const builderProviders = useMemo(
    () => Object.entries(groupedSelectableModels).map(([providerId, group]) => ({ providerId, ...(group as any) })),
    [groupedSelectableModels]
  );
  const lastStructuredModelStep = useMemo(() => {
    const step = [...draft.models].reverse().find((entry) => entry && typeof entry === "object" && entry.kind === "model");
    return step || null;
  }, [draft.models]);

  const effectiveBuilderProviderId = builderProviderId || lastStructuredModelStep?.providerId || (typeof lastStructuredModelStep?.model === "string" ? lastStructuredModelStep.model.split("/")[0] : "");
  const effectiveBuilderModelValue = builderModelValue || lastStructuredModelStep?.model || "";
  const effectiveBuilderConnectionId = builderConnectionId !== "__auto__" ? builderConnectionId : (lastStructuredModelStep?.connectionId || "__auto__");

  const selectedBuilderProvider = builderProviders.find((provider) => provider.providerId === effectiveBuilderProviderId) || null;
  const selectedBuilderConnections = useMemo(
    () => activeProviders.filter((connection) => (connection?.provider || connection?.id) === effectiveBuilderProviderId),
    [activeProviders, effectiveBuilderProviderId]
  );
  const builderComboRefs = useMemo(
    () => combos.filter((combo) => combo?.id !== editingCombo?.id),
    [combos, editingCombo]
  );
  const weightTotal = draft.models.length > 0 ? Math.round((100 / draft.models.length) * draft.models.length) : 0;
  const comboRefCount = draft.models.filter((entry) => entry && typeof entry === "object" && entry.kind === "combo-ref").length;
  const pinnedAccountCount = draft.models.filter((entry) => entry && typeof entry === "object" && entry.connectionId).length;
  const pricedModelCount = draft.models.reduce((count, modelValue) => {
    const raw = formatStepLabel(modelValue);
    if (!raw || raw.startsWith("ref:")) return count;
    const [provider, ...rest] = raw.split("/");
    const model = rest.join("/");
    return getPricingForModel(provider, model) ? count + 1 : count;
  }, 0);
  const pricingCoveragePercent = draft.models.length > 0 ? Math.round((pricedModelCount / draft.models.length) * 100) : 0;
  const uniqueProviderCount = new Set(
    draft.models
      .map((entry) => formatStepLabel(entry))
      .filter(Boolean)
      .map((entry) => (entry.startsWith("ref:") ? null : entry.split("/")[0]))
      .filter(Boolean)
  ).size;

  const moveModel = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= draft.models.length || toIndex >= draft.models.length) return;
    setDraft((current) => {
      const nextModels = [...current.models];
      const [item] = nextModels.splice(fromIndex, 1);
      nextModels.splice(toIndex, 0, item);
      return { ...current, models: nextModels };
    });
  };

  const handleDragStart = (_, index) => setDragIndex(index);
  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const handleDragOver = (event, index) => {
    event.preventDefault();
    setDragOverIndex(index);
  };
  const handleDrop = (event, index) => {
    event.preventDefault();
    if (dragIndex !== null) moveModel(dragIndex, index);
    handleDragEnd();
  };
  const handleMoveUp = (index) => moveModel(index, index - 1);
  const handleMoveDown = (index) => moveModel(index, index + 1);
  const handleRemoveModel = (index) => {
    setDraft((current) => ({ ...current, models: current.models.filter((_, idx) => idx !== index) }));
  };

  const goToNextStage = () => {
    const currentIndex = visibleStages.indexOf(stage);
    const nextStage = visibleStages[Math.min(visibleStages.length - 1, currentIndex + 1)];
    if (nextStage) setStage(nextStage);
  };

  const goToPreviousStage = () => {
    const currentIndex = visibleStages.indexOf(stage);
    const previousStage = visibleStages[Math.max(0, currentIndex - 1)];
    if (previousStage) setStage(previousStage);
  };


  const startCreate = () => {
    setEditingCombo(null);
    setDraft(buildInitialDraft());
    setComboEditorError("");
    setStage("basics");
    setShowComboEditor(true);
  };

  const startEdit = (combo) => {
    setEditingCombo(combo);
    setComboEditorError("");
    setShowEditModal(true);
    setShowComboEditor(false);
  };

  const resetBuilder = () => {
    setEditingCombo(null);
    setDraft(buildInitialDraft());
    setStage("basics");
    setStepInput("");
  };

  const getApiErrorMessage = async (response, fallback) => {
    const data = await response.json().catch(() => null);
    if (typeof data?.error === "string") return data.error;
    if (typeof data?.error?.message === "string") return data.error.message;
    return fallback;
  };

  const invalidateCombos = () => queryClient.invalidateQueries({ queryKey: queryKeys.combos() });
  const invalidateMappings = () => queryClient.invalidateQueries({ queryKey: queryKeys.modelComboMappings() });

  const deleteComboMutation = useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to delete combo"));
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.combos() });
      const previous = queryClient.getQueryData<CombosQueryResponse>(queryKeys.combos());
      const deletedCombo = combos.find((combo) => combo.id === id);
      queryClient.setQueryData<CombosQueryResponse>(queryKeys.combos(), (current) => ({
        ...(current || {}),
        combos: ((current?.combos || []) as ComboRecord[]).filter((c) => c.id !== id),
      }));
      if (deletedCombo?.name && recentlyCreatedCombo === deletedCombo.name) {
        setRecentlyCreatedCombo("");
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.combos(), context.previous);
    },
    onSettled: () => { void invalidateCombos(); },
  });

  const saveComboMutation = useMutation({
    retry: false,
    mutationFn: async ({ endpoint, method, body }: { endpoint: string; method: string; body: Record<string, unknown> }) => {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to save combo"));
    },
    onSuccess: async () => {
      await invalidateCombos();
      setRecentlyCreatedCombo(draft.name);
      setShowComboEditor(false);
      resetBuilder();
    },
    onError: (error) => setComboEditorError(error?.message || "Failed to save combo"),
    onSettled: () => setSaving(false),
  });

  const testComboMutation = useMutation({
    retry: false,
    mutationFn: async ({ name }: { name: string }) => {
      const response = await fetch("/api/combos/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboName: name }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || "Failed to test combo");
      }
      return data;
    },
    onSuccess: (data) => setTestResults(data),
    onError: (error) => setTestResults({ error: error?.message || "Failed to test combo" }),
    onSettled: () => setTestingCombo(""),
  });

  const duplicateComboMutation = useMutation({
    retry: false,
    mutationFn: async (combo: ComboRecord) => {
      const existingNames = combos.map((entry) => entry.name);
      const baseName = String(combo.name || "combo").replace(/-copy(-\d+)?$/, "");
      let newName = `${baseName}-copy`;
      let counter = 2;
      while (existingNames.includes(newName)) {
        newName = `${baseName}-copy-${counter}`;
        counter += 1;
      }
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          strategy: combo.strategy || "priority",
          priority: Number(combo.priority) || 0,
          models: combo.models || [],
          config: combo.config || {},
        }),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to duplicate combo"));
    },
    onSettled: () => { void invalidateCombos(); },
  });

  const toggleComboMutation = useMutation({
    retry: false,
    mutationFn: async (combo: ComboRecord) => {
      const res = await fetch(`/api/combos/${combo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: !combo.isHidden }),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to update combo"));
    },
    onMutate: async (combo) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.combos() });
      const previous = queryClient.getQueryData<CombosQueryResponse>(queryKeys.combos());
      queryClient.setQueryData<CombosQueryResponse>(queryKeys.combos(), (current) => ({
        ...(current || {}),
        combos: ((current?.combos || []) as ComboRecord[]).map((entry) => entry.id === combo.id ? { ...entry, isHidden: !combo.isHidden } : entry),
      }));
      return { previous };
    },
    onError: (_error, _combo, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.combos(), context.previous);
    },
    onSettled: () => { void invalidateCombos(); },
  });

  const saveMappingMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const endpoint = mappingDraft.id ? `/api/model-combo-mappings/${mappingDraft.id}` : "/api/model-combo-mappings";
      const method = mappingDraft.id ? "PUT" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: mappingDraft.pattern,
          comboId: mappingDraft.comboId,
          priority: Number(mappingDraft.priority) || 0,
          enabled: mappingDraft.enabled,
          description: mappingDraft.description,
        }),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to save mapping"));
    },
    onSuccess: async () => {
      await invalidateMappings();
      setShowMappingEditor(false);
    },
    onError: (error) => setMappingEditorError(error?.message || "Failed to save mapping"),
  });

  const deleteMappingMutation = useMutation({
    retry: false,
    mutationFn: async (mappingId: string) => {
      const res = await fetch(`/api/model-combo-mappings/${mappingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to delete mapping"));
    },
    onMutate: async (mappingId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.modelComboMappings() });
      const previous = queryClient.getQueryData<MappingsQueryResponse>(queryKeys.modelComboMappings());
      queryClient.setQueryData<MappingsQueryResponse>(queryKeys.modelComboMappings(), (current) => ({
        ...(current || {}),
        mappings: ((current?.mappings || []) as ComboMappingRecord[]).filter((mapping) => mapping.id !== mappingId),
      }));
      return { previous };
    },
    onError: (_error, _mappingId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.modelComboMappings(), context.previous);
    },
    onSettled: () => { void invalidateMappings(); },
  });

  const handleDelete = (id) => {
    if (!confirm("Delete this combo?")) return;
    deleteComboMutation.mutate(id);
  };

  const handleDeleteCombo = handleDelete;

  const handleAddSelectedModel = (model) => {
    const nextValue = model.value;
    if (draft.models.some((entry) => getStepKey(entry) === nextValue)) return;
    setDraft((current) => ({ ...current, models: [...current.models, nextValue] }));
  };

  const handleAddManualStep = () => {
    const nextStep = stepInput.trim();
    if (!nextStep || draft.models.some((entry) => getStepKey(entry) === nextStep)) return;
    setDraft((current) => ({ ...current, models: [...current.models, nextStep] }));
    setStepInput("");
  };

  const handleAddBuilderStep = () => {
    if (!effectiveBuilderModelValue || !effectiveBuilderProviderId) return;
    const selectedConnection =
      effectiveBuilderConnectionId && effectiveBuilderConnectionId !== "__auto__"
        ? selectedBuilderConnections.find((connection) => connection.id === effectiveBuilderConnectionId) || null
        : null;

    const nextStep = {
      kind: "model",
      model: effectiveBuilderModelValue,
      providerId: effectiveBuilderProviderId,
      connectionId: selectedConnection ? selectedConnection.id : null,
      label: selectedConnection?.label || selectedConnection?.name || undefined,
    };

    if (draft.models.some((entry) => getStepKey(entry) === getStepKey(nextStep))) return;
    setDraft((current) => ({ ...current, models: [...current.models, nextStep] }));
    setBuilderProviderId("");
    setBuilderModelValue("");
    setBuilderConnectionId("__auto__");
  };

  const handleAddComboReference = () => {
    if (!builderComboRefName) return;
    const nextStep = { kind: "combo-ref", comboName: builderComboRefName };
    if (draft.models.some((entry) => getStepKey(entry) === getStepKey(nextStep))) return;
    setDraft((current) => ({ ...current, models: [...current.models, nextStep] }));
    setBuilderComboRefName("");
  };

  const handleSave = async () => {
    if (!draft.name.trim() || !VALID_NAME_REGEX.test(draft.name)) return;
    setComboEditorError("");
    setSaving(true);

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

    const endpoint = editingCombo ? `/api/combos/${editingCombo.id}` : "/api/combos";
    const method = editingCombo ? "PUT" : "POST";
    saveComboMutation.mutate({ endpoint, method, body });
  };

  const handleEditSave = (body) => {
    if (!editingCombo?.id) return;
    setComboEditorError("");
    setSaving(true);
    saveComboMutation.mutate({ endpoint: `/api/combos/${editingCombo.id}`, method: "PUT", body });
  };

  const handleTestCombo = ({ name }) => {
    setTestingCombo(name);
    testComboMutation.mutate({ name });
  };

  const handleDuplicateCombo = (combo) => {
    duplicateComboMutation.mutate(combo);
  };

  const handleToggleCombo = (combo) => {
    toggleComboMutation.mutate(combo);
  };

  const handleIntelligentComboUpdated = (updatedCombo) => {
    void invalidateCombos();
    // Update selectedIntelligentComboId if it was the one updated
    if (selectedIntelligentComboId === updatedCombo.id) {
      setSelectedIntelligentComboId(updatedCombo.id);
    }
  };

  const handleCreateMapping = async (combo) => {
    setMappingDraft({ id: null, pattern: `*${combo.name}*`, comboId: combo.id, priority: "0", enabled: true, description: "" });
    setMappingEditorError("");
    setShowMappingEditor(true);
  };

  const handleEditMapping = (mapping) => {
    setMappingDraft({
      id: mapping.id,
      pattern: mapping.pattern || "",
      comboId: mapping.comboId || "",
      priority: String(mapping.priority ?? 0),
      enabled: mapping.enabled !== false,
      description: mapping.description || "",
    });
    setMappingEditorError("");
    setShowMappingEditor(true);
  };

  const handleSaveMapping = () => {
    setMappingEditorError("");
    saveMappingMutation.mutate();
  };

  const handleDeleteMapping = (mappingId) => {
    deleteMappingMutation.mutate(mappingId);
  };

  const loading = combosQuery.isPending && combos.length === 0;

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-80" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <CombosHeader
        combos={combos}
        mappings={mappings}
        search={search}
        setSearch={setSearch}
        startCreate={startCreate}
        isExpertMode={isExpertMode}
        setIsExpertMode={setIsExpertMode}
        recentlyCreatedCombo={recentlyCreatedCombo}
        handleTestCombo={handleTestCombo}
        setRecentlyCreatedCombo={setRecentlyCreatedCombo}
        strategyFilter={strategyFilter}
        setStrategyFilter={setStrategyFilter}
        isIntelligentStrategy={isIntelligentStrategy}
      />

      {/* Intelligent Combo Panel - Shows when intelligent filter is active */}
      {normalizedFilter === "intelligent" && selectedIntelligentCombo && (
        <IntelligentComboPanel
          combo={selectedIntelligentCombo}
          allCombos={intelligentCombos}
          activeProviders={activeProviders}
          onComboUpdated={handleIntelligentComboUpdated}
        />
      )}

      {/* Main Content - Single Column Layout */}
      <div className="space-y-4">
        {mappings.length > 0 ? (
          <Card className="rounded-[4px] border-[var(--color-border)]">
            <CardContent>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-main">Model mappings</h2>
                <span className="text-xs text-text-muted">{mappings.length} total</span>
              </div>
              <div className="space-y-2">
                {mappings.map((mapping) => (
                  <div key={mapping.id} className="flex flex-col gap-2 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <code className="block truncate text-sm font-medium text-text-main">{mapping.pattern}</code>
                      <p className="mt-1 text-xs text-text-muted">
                        {mapping.comboName || mapping.comboId} · priority {mapping.priority ?? 0} · {mapping.enabled === false ? "disabled" : "enabled"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleEditMapping(mapping)} className="rounded p-1.5 text-text-muted hover:text-primary" title="Edit mapping">
                        <AppIcon name="edit" data-icon="inline-start" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteMapping(mapping.id)} className="rounded p-1.5 text-text-muted hover:text-red-500" title="Delete mapping">
                        <AppIcon name="delete" data-icon="inline-start" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Combo List */}
        <Card className="rounded-[4px] border-[var(--color-border)]">
          <CardContent>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-main">Your Combos</h2>
            <span className="text-xs text-text-muted">{visibleCombos.length} total</span>
          </div>
          {visibleCombos.length === 0 ? (
            <Empty className="rounded-[4px] border-dashed bg-card/40 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon"><AppIcon name="layers" /></EmptyMedia>
                <EmptyTitle>No combos yet.</EmptyTitle>
                <EmptyDescription>Create a combo to define ordered fallback or intelligent routing.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-2">
              {visibleCombos.map((combo) => (
                <ComboCard
                  key={combo.id}
                  combo={combo}
                  selectedIntelligentCombo={selectedIntelligentCombo}
                  formatStepLabel={formatStepLabel}
                  getStepKey={getStepKey}
                  testingCombo={testingCombo}
                  handleTestCombo={handleTestCombo}
                  handleDuplicateCombo={handleDuplicateCombo}
                  startEdit={startEdit}
                  handleDeleteCombo={handleDeleteCombo}
                  handleToggleCombo={handleToggleCombo}
                  handleCreateMapping={handleCreateMapping}
                  t={t}
                />
              ))}
            </div>
          )}
          </CardContent>
        </Card>
      </div>

      <ComboTestResultsModal
        testResults={testResults}
        testingCombo={testingCombo}
        setTestResults={setTestResults}
        setTestingCombo={setTestingCombo}
      />

      {/* Combo Edit Modal (non-wizard) */}
      <ComboEditModal
        key={editingCombo?.id || "combo-edit-modal"}
        combo={editingCombo}
        combos={combos}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        providerModelsByProvider={providerModelsByProvider}
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setComboEditorError(""); }}
        onSave={handleEditSave}
        saving={saving}
        error={comboEditorError}
      />

      {/* Combo Create Wizard (keep wizard for create) */}
      {showComboEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-[900px] rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
            {/* Modal Header */}
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text-main)]">{editingCombo ? t("editCombo") : t("createCombo")}</h3>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{STAGE_META[stage].description}</p>
              </div>
              <button 
                onClick={() => setShowComboEditor(false)}
                className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-bg-alt)] transition-colors cursor-pointer"
              >
                <AppIcon name="close" size={18} />
              </button>
            </div>

            {/* Step Indicator - Clean horizontal stepper */}
            <div className="mb-6">
              <div className="flex items-center justify-center gap-0">
                {visibleStages.map((builderStage, index) => {
                  const active = stage === builderStage;
                  const complete = stageComplete(builderStage, draft);
                  const previousStagesComplete = visibleStages
                    .slice(0, index)
                    .every((previousStage) => stageComplete(previousStage, draft));
                  const stageReachable = index === 0 || previousStagesComplete;
                  const connectorComplete = complete && stageComplete(visibleStages[index + 1], draft);
                  return (
                    <div key={builderStage} className="flex items-center">
                      {/* Step circle with label */}
                      <div className="flex flex-col items-center">
                        <button
                          type="button"
                          disabled={!stageReachable}
                          onClick={() => stageReachable && setStage(builderStage)}
                          className={`flex h-8 w-8 items-center justify-center rounded-[4px] border-2 text-[12px] font-semibold transition-all ${stageReachable ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-60"} ${active
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-text-inverse)]"
                            : complete
                              ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                              : "border-[var(--color-border-strong)] text-[var(--color-text-muted)]"
                          }`}
                        >
                          {complete && !active ? (
                            <AppIcon name="check" size={14} />
                          ) : (
                            <span>{index + 1}</span>
                          )}
                        </button>
                        <span 
                          className={`mt-2 text-[10px] whitespace-nowrap ${active ? "text-[var(--color-text-main)] font-medium" : complete ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`}
                        >
                          {STAGE_META[builderStage].title}
                        </span>
                      </div>
                      {/* Connector line (except last) */}
                      {index < visibleStages.length - 1 && (
                        <div className={`mx-3 h-px w-12 ${connectorComplete ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-strong)]"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              {/* Sidebar - Strategy Guide */}
              <div className="space-y-4">
                <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">{STAGE_META[stage].title}</p>
                  <h4 className="mt-2 text-base font-semibold text-[var(--color-text-main)]">{currentGuide.title}</h4>
                  <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{currentGuide.description}</p>
                  <div className="mt-3 space-y-2">
                    {currentGuide.tips.map((tip) => (
                      <div key={tip} className="flex items-start gap-2 rounded bg-[var(--color-surface)] px-3 py-2 text-xs leading-5 text-[var(--color-text-muted)]">
                        <AppIcon name="check_circle" size={14} className="mt-0.5 text-[var(--color-primary)]" />
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {stage === "basics" && (
                  <BuilderBasicsStage draft={draft} setDraft={setDraft} />
                )}

                {stage === "steps" && (
                  <BuilderStepsStage
                    draft={draft}
                    builderProviders={builderProviders}
                    effectiveBuilderProviderId={effectiveBuilderProviderId}
                    setBuilderProviderId={setBuilderProviderId}
                    setBuilderModelValue={setBuilderModelValue}
                    setBuilderConnectionId={setBuilderConnectionId}
                    selectedBuilderProvider={selectedBuilderProvider}
                    effectiveBuilderModelValue={effectiveBuilderModelValue}
                    selectedBuilderConnections={selectedBuilderConnections}
                    effectiveBuilderConnectionId={effectiveBuilderConnectionId}
                    builderComboRefName={builderComboRefName}
                    setBuilderComboRefName={setBuilderComboRefName}
                    builderComboRefs={builderComboRefs}
                    handleAddBuilderStep={handleAddBuilderStep}
                    stepInput={stepInput}
                    setStepInput={setStepInput}
                    handleAddManualStep={handleAddManualStep}
                    setShowModelSelect={setShowModelSelect}
                    handleAddComboReference={handleAddComboReference}
                    dragOverIndex={dragOverIndex}
                    dragIndex={dragIndex}
                    formatStepLabel={formatStepLabel}
                    getStepKey={getStepKey}
                    getPricingForModel={getPricingForModel}
                    handleDragStart={handleDragStart}
                    handleDragEnd={handleDragEnd}
                    handleDragOver={handleDragOver}
                    handleDrop={handleDrop}
                    handleMoveUp={handleMoveUp}
                    handleMoveDown={handleMoveDown}
                    handleRemoveModel={handleRemoveModel}
                    WeightTotalBar={WeightTotalBar}
                    pricedModelCount={pricedModelCount}
                    pricingCoveragePercent={pricingCoveragePercent}
                    t={t}
                  />
                )}

                {stage === "strategy" && (
                  <BuilderStrategyStage
                    draft={draft}
                    setDraft={setDraft}
                    ROUTING_STRATEGIES={ROUTING_STRATEGIES}
                    isIntelligentStrategy={isIntelligentStrategy}
                    normalizeIntelligentRoutingConfig={normalizeIntelligentRoutingConfig}
                    isExpertMode={isExpertMode}
                    showAdvanced={showAdvanced}
                    setShowAdvanced={setShowAdvanced}
                    t={t}
                  />
                )}

                {stage === "intelligent" && isIntelligentStrategy(draft.strategy) && (
                  <BuilderIntelligentStage draft={draft} setDraft={setDraft} activeProviders={activeProviders} />
                )}

                {comboEditorError ? (
                  <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{comboEditorError}</p>
                ) : null}

                {stage === "review" && (
                  <BuilderReviewStage
                    draft={draft}
                    comboRefCount={comboRefCount}
                    pinnedAccountCount={pinnedAccountCount}
                    uniqueProviderCount={uniqueProviderCount}
                    pricedModelCount={pricedModelCount}
                    pricingCoveragePercent={pricingCoveragePercent}
                    formatStepLabel={formatStepLabel}
                    getStepKey={getStepKey}
                    stepBadgeClass={stepBadgeClass}
                    t={t}
                  />
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="mt-6 flex justify-between gap-2 border-t border-[var(--color-border)] pt-4">
              <Button variant="ghost" onClick={() => stage === "basics" ? setShowComboEditor(false) : goToPreviousStage()}>{t("previousStage")}</Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setShowComboEditor(false)}>{t("cancel")}</Button>
                {stage === "review" ? (
                  <Button onClick={handleSave} disabled={saving || !draft.name.trim() || draft.models.length === 0}>
                    {saving ? "Saving..." : editingCombo ? t("save") : t("createCombo")}
                  </Button>
                ) : (
                  <Button onClick={goToNextStage} disabled={!stageComplete(stage, draft)}>{t("nextStage")}</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mapping Editor Modal */}
      {showMappingEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-main">Edit Mapping</h3>
              <button onClick={() => setShowMappingEditor(false)} className="text-text-muted hover:text-text-main">
                <AppIcon name="close" size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <Field>
                <FieldLabel>Pattern</FieldLabel>
                <Input value={mappingDraft.pattern} onChange={(e) => setMappingDraft((c) => ({ ...c, pattern: e.target.value }))} placeholder="*" />
              </Field>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-muted">Combo</label>
                <select value={mappingDraft.comboId} onChange={(e) => setMappingDraft((c) => ({ ...c, comboId: e.target.value }))} className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-text-main">
                  {combos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <Input type="number" value={mappingDraft.priority} onChange={(e) => setMappingDraft((c) => ({ ...c, priority: e.target.value }))} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-text-main">
                <input type="checkbox" checked={mappingDraft.enabled} onChange={(e) => setMappingDraft((c) => ({ ...c, enabled: e.target.checked }))} />
                Enabled
              </label>
              {mappingEditorError ? (
                <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{mappingEditorError}</p>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowMappingEditor(false)}>Cancel</Button>
              <Button onClick={handleSaveMapping}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <ModelSelectModal
        isOpen={showModelSelect}
        onClose={() => setShowModelSelect(false)}
        onSelect={handleAddSelectedModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Add Model Step"
      />
    </div>
  );
}

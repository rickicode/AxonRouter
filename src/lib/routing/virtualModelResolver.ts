import { getCurrentCombos } from "@/lib/modelCatalogAccess";
import { getUsageAnalyticsFromDb } from "@/lib/usageDb/queries/analytics";
import { getAutoRoutingTelemetryBreakdown, getAutoRoutingTelemetrySummary } from "@/lib/routing/autoRoutingTelemetry";
import { getPricingForModel } from "@/shared/constants/pricing";

type ComboLike = {
  name?: string;
  priority?: number | string;
  models?: any[];
};

type TelemetrySummary = {
  fallbackRate?: number;
  errorRate?: number;
  avgLatencyMs?: number;
  totalCost?: number;
  totalRequests?: number;
  totalSamples?: number;
};

type TelemetryBreakdown = {
  byCombo?: Record<string, {
    fallbackRate?: number;
    errorRate?: number;
    totalSamples?: number;
  }>;
};

type VirtualModelExecutionOptions = {
  modelStr?: any;
  settings?: any;
  telemetry?: any;
};

export const VIRTUAL_SYSTEM_MODELS = {
  auto: {
    id: "auto",
    goal: "balanced",
    label: "Auto",
    description: "Automatically routes through the built-in balanced combo.",
  },
  economy: {
    id: "economy",
    goal: "economy",
    label: "Economy",
    description: "Prefers the built-in lower-cost combo.",
  },
  balanced: {
    id: "balanced",
    goal: "balanced",
    label: "Balanced",
    description: "Balanced default across cost, latency, and quality.",
  },
  premium: {
    id: "premium",
    goal: "premium",
    label: "Premium",
    description: "Prefers the built-in higher-quality combo.",
  },
};

function normalizeValue(value: any) {
  return String(value || "").trim().toLowerCase();
}

function getComboPriority(combo: any = {}) {
  return Number.isFinite(Number(combo.priority)) ? Number(combo.priority) : 0;
}

function chooseComboForGoal(combos: ComboLike[] = [], goal = "balanced") {
  if (!Array.isArray(combos) || combos.length === 0) return null;

  const exactName = combos.find((combo) => normalizeValue(combo.name) === normalizeValue(goal));
  if (exactName) return exactName;

  if (goal === "balanced") {
    return combos.find((combo) => normalizeValue(combo.name) === "balanced")
      || combos.find((combo) => normalizeValue(combo.name) === "auto")
      || [...combos].sort((left, right) => getComboPriority(right) - getComboPriority(left))[0]
      || null;
  }

  return [...combos].sort((left, right) => getComboPriority(right) - getComboPriority(left))[0] || null;
}

function estimateComboCost(combo: ComboLike = {}) {
  const models = Array.isArray(combo?.models) ? combo.models : [];
  if (models.length === 0) return Number.POSITIVE_INFINITY;

  const scored = models.map((step) => {
    // Handle both string and step-object formats
    let fullModelId;
    if (typeof step === "string") {
      fullModelId = step;
    } else if (step && typeof step === "object" && step.kind !== "combo-ref") {
      const model = typeof step.model === "string" ? step.model.trim() : "";
      const providerId = step.providerId || step.provider || null;
      fullModelId = providerId && !model.includes("/") ? `${providerId}/${model}` : model;
    } else {
      return Number.POSITIVE_INFINITY;
    }
    if (typeof fullModelId !== "string" || !fullModelId.includes("/")) {
      return Number.POSITIVE_INFINITY;
    }
    const [provider, ...rest] = fullModelId.split("/");
    const model = rest.join("/");
    const pricing = getPricingForModel(provider, model);
    if (!pricing) return Number.POSITIVE_INFINITY;
    return Number(pricing.input || 0) + Number(pricing.output || 0) + Number(pricing.reasoning || 0);
  });

  const finiteScores = scored.filter(Number.isFinite);
  if (finiteScores.length === 0) return Number.POSITIVE_INFINITY;
  return finiteScores.reduce((sum, value) => sum + value, 0) / finiteScores.length;
}

function chooseAutoCombo(combos: ComboLike[] = [], preferredGoal = "balanced", telemetryBreakdown: TelemetryBreakdown = {}) {
  if (!Array.isArray(combos) || combos.length === 0) {
    return { selectedCombo: null, ranking: [] };
  }

  const ranking = [...combos]
    .map((combo) => {
      const name = normalizeValue(combo.name);
      const comboTelemetry = telemetryBreakdown?.byCombo?.[combo.name] || telemetryBreakdown?.byCombo?.[name] || null;
      const fallbackRate = Number(comboTelemetry?.fallbackRate || 0);
      const errorRate = Number(comboTelemetry?.errorRate || 0);
      const totalSamples = Number(comboTelemetry?.totalSamples || 0);
      const priority = getComboPriority(combo);
      const goalBoost = name === preferredGoal ? 10 : name === "balanced" ? 4 : 0;
      const reliabilityScore = (1 - fallbackRate) * 10 + (1 - errorRate) * 10;
      const sampleBoost = Math.min(totalSamples, 10) * 0.5;
      const averageCost = estimateComboCost(combo);
      const costPenalty = Number.isFinite(averageCost)
        ? preferredGoal === "economy"
          ? averageCost * 2.5
          : preferredGoal === "premium"
            ? averageCost * 0.2
            : averageCost * 0.8
        : 12;
      const score = reliabilityScore + sampleBoost + priority + goalBoost - costPenalty;
      return {
        combo,
        score,
        metrics: {
          fallbackRate,
          errorRate,
          totalSamples,
          priority,
          goalBoost,
          reliabilityScore: Number(reliabilityScore.toFixed(3)),
          sampleBoost: Number(sampleBoost.toFixed(3)),
          averageCost: Number.isFinite(averageCost) ? Number(averageCost.toFixed(3)) : null,
          costPenalty: Number(costPenalty.toFixed(3)),
        },
      };
    })
    .sort((left, right) => right.score - left.score);

  return {
    selectedCombo: ranking[0]?.combo || null,
    ranking,
  };
}

function getDefaultComboStrategy(goal = "balanced") {
  if (goal === "economy") return { strategy: "priority", stickyLimit: 1 };
  if (goal === "premium") return { strategy: "priority", stickyLimit: 4 };
  return { strategy: "priority", stickyLimit: 2 };
}

export function isVirtualSystemModel(modelStr: any) {
  return Object.prototype.hasOwnProperty.call(VIRTUAL_SYSTEM_MODELS, normalizeValue(modelStr));
}

export function getVirtualSystemModelDefinition(modelStr: any) {
  return VIRTUAL_SYSTEM_MODELS[normalizeValue(modelStr)] || null;
}

function normalizeTelemetry(telemetry: any = null): TelemetrySummary {
  if (telemetry && typeof telemetry === "object") {
    return {
      fallbackRate: Number(telemetry.fallbackRate || 0),
      errorRate: Number(telemetry.errorRate || 0),
      avgLatencyMs: Number(telemetry.avgLatencyMs || 0),
      totalCost: Number(telemetry.totalCost || 0),
      totalRequests: Number(telemetry.totalRequests || 0),
    };
  }

  const analytics = getUsageAnalyticsFromDb({ period: "30d" });
  const byProvider = Array.isArray(analytics?.byProvider) ? analytics.byProvider : [];
  const totalCost = byProvider.reduce((sum, row) => sum + Number(row?.cost || 0), 0);
  const totalRequests = byProvider.reduce((sum, row) => sum + Number(row?.requests || 0), 0);
  const autoTelemetry: any = getAutoRoutingTelemetrySummary();

  return {
    fallbackRate: Number(autoTelemetry.fallbackRate || 0),
    errorRate: Number(autoTelemetry.errorRate || 0),
    avgLatencyMs: 0,
    totalCost,
    totalRequests,
    totalSamples: Number(autoTelemetry.totalSamples || 0),
  };
}

function resolveAutoProfile(settings: any = {}, telemetrySummary: TelemetrySummary = {}) {
  const configuredProfile = settings?.routing?.profile || settings?.routingProfile || "balanced";
  const errorRate = Number(telemetrySummary.errorRate || 0);
  const fallbackRate = Number(telemetrySummary.fallbackRate || 0);
  const totalCost = Number(telemetrySummary.totalCost || 0);

  if (errorRate >= 0.15 || fallbackRate >= 0.2) {
    return {
      profile: "premium",
      reason: "auto escalated to premium because recent error/fallback pressure is elevated",
    };
  }

  if (totalCost >= 50) {
    return {
      profile: "economy",
      reason: "auto shifted to economy because recent spend is above the optimizer threshold",
    };
  }

  return {
    profile: configuredProfile === "premium" || configuredProfile === "economy" ? configuredProfile : "balanced",
    reason: `auto stayed on ${configuredProfile === "premium" || configuredProfile === "economy" ? configuredProfile : "balanced"} as the current routing default`,
  };
}

export async function resolveVirtualModelExecution({ modelStr, settings = {}, telemetry = null }: VirtualModelExecutionOptions = {}) {
  const definition = getVirtualSystemModelDefinition(modelStr);
  if (!definition) return null;

  const combos: ComboLike[] = await getCurrentCombos();
  const telemetrySummary = normalizeTelemetry(telemetry);
  const telemetryBreakdown: TelemetryBreakdown = getAutoRoutingTelemetryBreakdown() as any;
  const autoProfileDecision = definition.id === "auto"
    ? resolveAutoProfile(settings, telemetrySummary)
    : null;
  const resolvedGoal = autoProfileDecision?.profile || definition.goal;
  const autoComboDecision = definition.id === "auto"
    ? chooseAutoCombo(combos, resolvedGoal, telemetryBreakdown)
    : null;
  const selectedCombo = definition.id === "auto"
    ? autoComboDecision?.selectedCombo
    : chooseComboForGoal(combos, resolvedGoal);
  if (!selectedCombo?.name) return null;

  const comboStrategyDefaults = getDefaultComboStrategy(resolvedGoal);

  return {
    requestedModel: definition.id,
    selectedProfile: resolvedGoal,
    selectedCombo: selectedCombo.name,
    comboStrategy: comboStrategyDefaults.strategy,
    comboStickyLimit: comboStrategyDefaults.stickyLimit,
    providerStrategy: resolvedGoal === "economy" ? "fill-first" : "round-robin",
    stickyLimit: comboStrategyDefaults.stickyLimit,
    reason: [
      definition.id === "auto"
        ? `${autoProfileDecision?.reason || `auto resolved using ${resolvedGoal} profile`} and selected combo \"${selectedCombo.name}\" based on combo telemetry`
        : `${definition.id} virtual model selected built-in combo \"${selectedCombo.name}\"`,
      `provider routing profile set to ${resolvedGoal}`,
    ],
    telemetrySummary,
    comboRanking: autoComboDecision?.ranking?.map((entry) => ({
      combo: entry.combo.name,
      score: Number(entry.score.toFixed(3)),
      metrics: entry.metrics,
    })) || null,
  };
}

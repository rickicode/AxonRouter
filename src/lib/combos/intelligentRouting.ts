export const INTELLIGENT_STRATEGIES = ["auto", "lkgp"];
export const INTELLIGENT_ROUTING_FILTERS = ["all", "intelligent", "deterministic"];

export const DEFAULT_INTELLIGENT_WEIGHTS = {
  quota: 0.2,
  health: 0.25,
  costInv: 0.2,
  latencyInv: 0.15,
  taskFit: 0.1,
  stability: 0.05,
  tierPriority: 0.05,
};

export const MODE_PACK_OPTIONS = [
  { id: "ship-fast", label: "Ship Fast", emoji: "rocket_launch" },
  { id: "cost-saver", label: "Cost Saver", emoji: "savings" },
  { id: "quality-first", label: "Quality First", emoji: "target" },
  { id: "offline-friendly", label: "Offline Friendly", emoji: "cloud_off" },
];

export const ROUTER_STRATEGY_OPTIONS = [
  { id: "rules", label: "Rules (6-Factor Scoring)" },
  { id: "cost", label: "Cost Optimized" },
  { id: "latency", label: "Latency Optimized" },
  { id: "lkgp", label: "Last Known Good Provider" },
];

export const FACTOR_LABELS = {
  quota: "Quota",
  health: "Health",
  costInv: "Cost",
  latencyInv: "Latency",
  taskFit: "Task Fit",
  stability: "Stability",
  tierPriority: "Tier",
};

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toPositiveNumber(value) {
  const numericValue = toFiniteNumber(value);
  return numericValue !== null && numericValue > 0 ? numericValue : undefined;
}

export function isIntelligentStrategy(strategy) {
  return typeof strategy === "string" && INTELLIGENT_STRATEGIES.includes(strategy);
}

export function getStrategyCategory(strategy) {
  return isIntelligentStrategy(strategy) ? "intelligent" : "deterministic";
}

export function normalizeIntelligentRoutingFilter(value) {
  if (typeof value === "string" && INTELLIGENT_ROUTING_FILTERS.includes(value)) {
    return value;
  }
  return "all";
}

export function filterCombosByStrategyCategory(combos, filter) {
  if (filter === "all") return combos;
  return (Array.isArray(combos) ? combos : []).filter((combo) => getStrategyCategory(combo?.strategy) === filter);
}

export function normalizeIntelligentRoutingConfig(config) {
  const configRecord = isRecord(config) ? config : {};
  const rawWeights = isRecord(configRecord.weights) ? configRecord.weights : {};

  return {
    candidatePool: Array.isArray(configRecord.candidatePool)
      ? configRecord.candidatePool.filter((value) => typeof value === "string")
      : [],
    explorationRate: Math.min(1, Math.max(0, toFiniteNumber(configRecord.explorationRate) ?? 0.05)),
    modePack:
      typeof configRecord.modePack === "string" && configRecord.modePack.trim().length > 0
        ? configRecord.modePack
        : "ship-fast",
    budgetCap: toPositiveNumber(configRecord.budgetCap),
    weights: {
      quota: toFiniteNumber(rawWeights.quota) ?? DEFAULT_INTELLIGENT_WEIGHTS.quota,
      health: toFiniteNumber(rawWeights.health) ?? DEFAULT_INTELLIGENT_WEIGHTS.health,
      costInv: toFiniteNumber(rawWeights.costInv) ?? DEFAULT_INTELLIGENT_WEIGHTS.costInv,
      latencyInv: toFiniteNumber(rawWeights.latencyInv) ?? DEFAULT_INTELLIGENT_WEIGHTS.latencyInv,
      taskFit: toFiniteNumber(rawWeights.taskFit) ?? DEFAULT_INTELLIGENT_WEIGHTS.taskFit,
      stability: toFiniteNumber(rawWeights.stability) ?? DEFAULT_INTELLIGENT_WEIGHTS.stability,
      tierPriority: toFiniteNumber(rawWeights.tierPriority) ?? DEFAULT_INTELLIGENT_WEIGHTS.tierPriority,
    },
    routerStrategy:
      typeof configRecord.routerStrategy === "string" && configRecord.routerStrategy.trim().length > 0
        ? configRecord.routerStrategy
        : "rules",
  };
}

export function buildIntelligentProviderScores(combo) {
  const normalizedConfig = normalizeIntelligentRoutingConfig(combo?.config);
  const weights = normalizedConfig.weights;
  const pool = normalizedConfig.candidatePool;
  const baseScore = pool.length > 0 ? 1 / pool.length : 0;

  return pool.map((provider) => ({
    provider,
    model: "auto",
    score: baseScore,
    factors: weights,
  }));
}

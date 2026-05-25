/**
 * Auto-Combo Scoring Function
 *
 * Calculates a weighted score for each provider candidate based on 6 factors:
 *   1. Quota        (0.20) — residual capacity [0..1]
 *   2. Health       (0.25) — circuit breaker state
 *   3. CostInv      (0.20) — inverse cost normalized to pool
 *   4. LatencyInv   (0.15) — inverse p95 latency normalized to pool
 *   5. TaskFit      (0.10) — model × taskType fitness score
 *   6. Stability    (0.10) — variance-based prediction of consistency
 */

export const DEFAULT_WEIGHTS = {
  quota: 0.2,
  health: 0.25,
  costInv: 0.2,
  latencyInv: 0.15,
  taskFit: 0.1,
  stability: 0.05,
  tierPriority: 0.05,
};

export function calculateTierScore(tier, quotaResetIntervalSecs) {
  const BASE_TIER_SCORES = {
    ultra: 1.0,
    pro: 0.67,
    standard: 0.33,
    free: 0.0,
  };
  const baseScore = BASE_TIER_SCORES[tier?.toLowerCase() ?? ""] ?? 0.33;

  const resetBonus =
    quotaResetIntervalSecs != null && quotaResetIntervalSecs > 0
      ? Math.max(0, 1 - quotaResetIntervalSecs / 2_592_000)
      : 0;

  return Math.min(1, baseScore * 0.8 + resetBonus * 0.2);
}

export function calculateScore(factors, weights) {
  return (
    weights.quota * factors.quota +
    weights.health * factors.health +
    weights.costInv * factors.costInv +
    weights.latencyInv * factors.latencyInv +
    weights.taskFit * factors.taskFit +
    weights.stability * factors.stability +
    weights.tierPriority * factors.tierPriority
  );
}

export function calculateFactors(candidate, pool, taskType, getTaskFitness) {
  const maxCost = Math.max(...pool.map((p) => p.costPer1MTokens), 0.001);
  const maxLatency = Math.max(...pool.map((p) => p.p95LatencyMs), 1);
  const maxStdDev = Math.max(...pool.map((p) => p.latencyStdDev), 0.001);

  return {
    quota: Math.min(1, candidate.quotaRemaining / 100),
    health:
      candidate.circuitBreakerState === "CLOSED"
        ? 1.0
        : candidate.circuitBreakerState === "HALF_OPEN"
          ? 0.5
          : 0.0,
    costInv: 1 - candidate.costPer1MTokens / maxCost,
    latencyInv: 1 - candidate.p95LatencyMs / maxLatency,
    taskFit: getTaskFitness(candidate.model, taskType),
    stability: 1 - candidate.latencyStdDev / maxStdDev,
    tierPriority: calculateTierScore(candidate.accountTier, candidate.quotaResetIntervalSecs),
  };
}

export function scorePool(pool, taskType, weights = DEFAULT_WEIGHTS, getTaskFitness = (_model?: any, _taskType?: any) => 0.5) {
  return pool
    .map((candidate) => {
      const factors = calculateFactors(candidate, pool, taskType, getTaskFitness);
      return {
        provider: candidate.provider,
        model: candidate.model,
        score: calculateScore(factors, weights),
        factors,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function validateWeights(weights) {
  const sum = Number(Object.values(weights as any).reduce((a: any, b: any) => Number(a) + Number(b), 0));
  return Math.abs(sum - 1.0) < 0.01;
}

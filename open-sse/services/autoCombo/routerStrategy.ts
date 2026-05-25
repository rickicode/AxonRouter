/**
 * RouterStrategy — Pluggable Routing Strategy System
 *
 * Inspired by ClawRouter commit 14c83c258 "refactor: extract routing into pluggable RouterStrategy system".
 * Provides a RouterStrategy interface and two built-in implementations:
 *   - RulesStrategy (default): wraps the existing 6-factor scoring engine
 *   - CostStrategy: always picks cheapest available model
 */

import { scorePool } from "./scoring";
import { getTaskFitness } from "./taskFitness";

export class RulesStrategyImpl {
  get name() { return "rules"; }
  get description() { return "6-factor weighted scoring: quota, health, cost, latency, taskFit, stability"; }

  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const ranked = scorePool(
      eligible.length > 0 ? eligible : pool,
      context.taskType,
      undefined,
      (model: any, taskType: any) => Number(getTaskFitness(model, taskType) || 0)
    );
    const best = ranked[0];
    if (!best) throw new Error("[RulesStrategy] No candidates to score");
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `RulesStrategy: score=${best.score.toFixed(3)} (quota=${best.factors.quota.toFixed(2)}, health=${best.factors.health.toFixed(2)}, cost=${best.factors.costInv.toFixed(2)}, taskFit=${best.factors.taskFit.toFixed(2)})`,
      candidatesConsidered: ranked.length,
      finalScore: best.score,
    };
  }
}

export class CostStrategyImpl {
  get name() { return "cost"; }
  get description() { return "Always selects cheapest available provider (by costPer1MTokens)"; }

  select(pool, context) {
    const healthy = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = healthy.length > 0 ? healthy : pool;
    const sorted = [...candidates].sort((a, b) => a.costPer1MTokens - b.costPer1MTokens);
    const best = sorted[0];
    if (!best) throw new Error("[CostStrategy] No candidates available");
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `CostStrategy: cheapest at $${best.costPer1MTokens.toFixed(3)}/1M tokens`,
      candidatesConsidered: candidates.length,
      finalScore: best.costPer1MTokens === 0 ? 1.0 : 1 / best.costPer1MTokens,
    };
  }
}

export class LatencyStrategyImpl {
  get name() { return "latency"; }
  get description() { return "Prioritizes lowest p95 latency with reliability weighting"; }

  select(pool, context) {
    const healthy = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = healthy.length > 0 ? healthy : pool;
    const sorted = [...candidates].sort((a, b) => {
      const aPenalty = a.errorRate * 1000;
      const bPenalty = b.errorRate * 1000;
      return a.p95LatencyMs + aPenalty - (b.p95LatencyMs + bPenalty);
    });
    const best = sorted[0];
    if (!best) throw new Error("[LatencyStrategy] No candidates available");

    const latencyScore = best.p95LatencyMs > 0 ? Math.max(0.001, 10_000 / best.p95LatencyMs) : 1;
    const reliability = Math.max(0, 1 - best.errorRate);
    const finalScore = latencyScore * 0.7 + reliability * 0.3;

    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `LatencyStrategy: p95=${best.p95LatencyMs}ms, errorRate=${(best.errorRate * 100).toFixed(2)}%`,
      candidatesConsidered: candidates.length,
      finalScore,
    };
  }
}

export class LKGPStrategyImpl {
  get name() { return "lkgp"; }
  get description() { return "Tries last known good provider first, then falls back to rules"; }

  select(pool, context) {
    if (context.lkgpEnabled === false) {
      return getStrategy("rules").select(pool, context);
    }

    if (context.lastKnownGoodProvider) {
      const best = pool.find(
        (c) => c.provider === context.lastKnownGoodProvider && c.circuitBreakerState !== "OPEN"
      );
      if (best) {
        return {
          provider: best.provider,
          model: best.model,
          strategy: this.name,
          reason: `LKGP: using last known good provider ${best.provider}`,
          candidatesConsidered: 1,
          finalScore: 1.0,
        };
      }
    }

    // Fallback to rules strategy
    return getStrategy("rules").select(pool, context);
  }
}

// Registry
const strategyRegistry = new Map();
const rulesStrategy = new RulesStrategyImpl();
const costStrategy = new CostStrategyImpl();
const latencyStrategy = new LatencyStrategyImpl();
const lkgpStrategy = new LKGPStrategyImpl();

strategyRegistry.set("rules", rulesStrategy);
strategyRegistry.set("cost", costStrategy);
strategyRegistry.set("eco", costStrategy);
strategyRegistry.set("latency", latencyStrategy);
strategyRegistry.set("fast", latencyStrategy);
strategyRegistry.set("lkgp", lkgpStrategy);

export function getStrategy(name) {
  const strategy = strategyRegistry.get(name);
  if (!strategy) {
    console.warn(`[RouterStrategy] Strategy '${name}' not found, falling back to 'rules'`);
    return rulesStrategy;
  }
  return strategy;
}

export function registerStrategy(name, strategy) {
  if (strategyRegistry.has(name)) {
    console.warn(`[RouterStrategy] Overwriting strategy '${name}'`);
  }
  strategyRegistry.set(name, strategy);
}

export function listStrategies() {
  return [...strategyRegistry.entries()].map(([name, s]) => ({ name, description: s.description }));
}

export function selectWithStrategy(pool, context, strategyName = "rules") {
  return getStrategy(strategyName).select(pool, context);
}

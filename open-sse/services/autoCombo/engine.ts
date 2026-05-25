/**
 * Auto-Combo Engine — The `auto` combo type that self-manages provider selection.
 *
 * Features:
 *   - Scoring-based provider selection from candidate pool
 *   - Bandit exploration (configurable rate, default 5%)
 *   - Budget cap enforcement
 *   - Self-healing integration
 *   - Mode pack support
 */

import { scorePool, validateWeights, DEFAULT_WEIGHTS } from "./scoring";
import { getTaskFitness } from "./taskFitness";
import { getModePack } from "./modePacks";
import { getSelfHealingManager } from "./selfHealing";
import { classifyPromptIntent } from "../intentClassifier";

export function selectProvider(config: any, candidates: any[], taskType = "default", promptMessages?: any[]) {
  const healer = getSelfHealingManager();

  let effectiveTaskType = taskType;
  if ((taskType === "default" || taskType === "") && promptMessages?.length) {
    const lastUserMsg = [...promptMessages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      const text =
        typeof lastUserMsg.content === "string"
          ? lastUserMsg.content
          : Array.isArray(lastUserMsg.content)
            ? lastUserMsg.content
                .filter((b) => b.type === "text")
                .map((b) => b.text || "")
                .join(" ")
            : "";
      if (text.length > 10) {
        const intent = classifyPromptIntent(text, "");
        effectiveTaskType = intent;
      }
    }
  }

  let weights = config.weights;
  if (config.modePack) {
    const pack = getModePack(config.modePack);
    if (pack) weights = pack;
  }
  if (!validateWeights(weights)) weights = DEFAULT_WEIGHTS;

  const excluded = [];
  const pool = candidates.filter((c) => {
    if (config.candidatePool.length > 0 && !config.candidatePool.includes(c.provider)) return false;

    const evaluation = healer.evaluate(c.provider, 0.5, c.circuitBreakerState);
    if (evaluation.excluded) {
      excluded.push(c.provider);
      return false;
    }
    return true;
  });

  if (pool.length === 0) {
    pool.push(...candidates);
    excluded.length = 0;
  }

  const scored = scorePool(pool, effectiveTaskType, weights, (model: any, tt: any) => Number(getTaskFitness(model, tt) || 0));

  const finalCandidates = scored.filter((s) => {
    const eval_ = healer.evaluate(s.provider, s.score, "CLOSED");
    if (eval_.excluded) {
      excluded.push(s.provider);
      return false;
    }
    return true;
  });

  const candidates_ = finalCandidates.length > 0 ? finalCandidates : scored;

  const incidentMode = healer.isInIncidentMode();
  const effectiveExplorationRate = incidentMode ? 0 : config.explorationRate;

  let selected;
  const isExploration = Math.random() < effectiveExplorationRate && candidates_.length > 1;

  if (isExploration) {
    const idx = Math.floor(Math.random() * candidates_.length);
    selected = candidates_[idx];
  } else {
    selected = candidates_[0];
  }

  if (config.budgetCap && selected) {
    const candidate = candidates.find((c) => c.provider === selected.provider);
    if (candidate) {
      const estimatedCost = (candidate.costPer1MTokens / 1_000_000) * 1000;
      if (estimatedCost > config.budgetCap) {
        const cheapest = candidates_
          .map((s) => ({
            ...s,
            cost: candidates.find((c) => c.provider === s.provider)?.costPer1MTokens || 0,
          }))
          .sort((a, b) => a.cost - b.cost)[0];
        if (cheapest) selected = cheapest;
      }
    }
  }

  return {
    provider: selected?.provider || candidates[0]?.provider || "",
    model: selected?.model || candidates[0]?.model || "",
    score: selected?.score || 0,
    isExploration,
    factors: selected?.factors || {},
    excluded,
  };
}

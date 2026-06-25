// Routing policy
// Routing policy: score → complexity → target

import type { Features } from "./features";

export type Complexity = "low" | "medium" | "high";
export type TargetKey = "small" | "medium" | "planning" | "large" | "vision";

export interface RoutingProfile {
  scoreBias: number;
}

export interface RoutingTargets {
  small: string;
  medium: string;
  planning: string;
  large: string;
  vision: string;
}

export interface RoutingConfig {
  thresholds: { medium: number; high: number };
  profiles: Record<string, RoutingProfile>;
  targets: RoutingTargets;
}

export interface Decision {
  requestedModel: string;
  targetKey: TargetKey;
  target: string;
  task: string;
  complexity: Complexity;
  score: number;
  confidence: number;
  mode: string;
  reasons: string[];
}

const TARGET_RANK: Record<TargetKey, number> = {
  small: 0,
  medium: 1,
  planning: 2,
  large: 3,
  vision: 4,
};

function complexityForScore(score: number, thresholds: { medium: number; high: number }): Complexity {
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.medium) return "medium";
  return "low";
}

function chooseTargetKey(task: string, complexity: Complexity, hasImage: boolean): TargetKey {
  if (hasImage) return "vision";
  if (task === "planning" && complexity !== "low") return "planning";
  if (complexity === "high") return "large";
  if (complexity === "medium") return "medium";
  return "small";
}

export function makeDecision({
  requestedModel,
  features,
  routingConfig,
  hasImage = false,
}: {
  requestedModel: string;
  features: Features;
  routingConfig: RoutingConfig;
  hasImage?: boolean;
}): Decision | null {
  const profile = routingConfig.profiles[requestedModel];
  if (!profile) return null;

  let score = features.ruleScore;
  score += Number(profile.scoreBias || 0);

  if (features.hardFloor === "high") score = Math.max(score, routingConfig.thresholds.high);
  if (features.hardFloor === "medium") score = Math.max(score, routingConfig.thresholds.medium);
  score = Math.max(0, Math.min(100, score));

  const complexity = complexityForScore(score, routingConfig.thresholds);
  const targetKey = chooseTargetKey(features.task, complexity, hasImage);

  return {
    requestedModel,
    targetKey,
    target: routingConfig.targets[targetKey],
    task: features.task,
    complexity,
    score,
    confidence: features.ruleConfidence,
    mode: "active",
    reasons: Object.entries(features.flags).filter(([, v]) => v).map(([k]) => k),
  };
}

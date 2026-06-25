// Smart router engine
// Smart router: classify request → pick target

import { extractFeatures } from "./features";
import { makeDecision, type RoutingConfig, type RoutingProfile } from "./policy";
import { normalizeRequest } from "./normalizer";
import { DEFAULT_COMPILED } from "./task-classes";

export const VIRTUAL_MODEL_IDS = ["auto", "auto-fast", "auto-quality"] as const;
export type VirtualModelId = (typeof VIRTUAL_MODEL_IDS)[number];

export interface SmartRouterConfig {
  thresholds: { medium: number; high: number };
  profiles: Record<string, RoutingProfile>,
  targets: RoutingConfig["targets"];
}

// Default config
// Targets are placeholder names; AxonRouter auto-seeds combos for these
export const DEFAULT_CONFIG: SmartRouterConfig = {
  thresholds: { medium: 35, high: 70 },
  profiles: {
    auto: { scoreBias: 0 },
    "auto-fast": { scoreBias: -15 },
    "auto-quality": { scoreBias: 15 },
  },
  targets: {
    small: "auto-small",
    medium: "auto-medium",
    planning: "auto-planning",
    large: "auto-large",
    vision: "auto-vision",
  },
};

export interface RouterDecision {
  requestedModel: string;
  target: string;
  targetKey: string;
  task: string;
  complexity: string;
  score: number;
  confidence: number;
  reasons: string[];
  features: {
    chars: number;
    estimatedTokens: number;
    ruleScore: number;
    ruleConfidence: number;
    hardFloor: string | null;
  };
}

export class SmartRouter {
  private config: SmartRouterConfig;
  private compiled = DEFAULT_COMPILED;

  constructor(config: Partial<SmartRouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Reconfigure at runtime (e.g. when user changes settings). */
  configure(patch: Partial<SmartRouterConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  isVirtualModel(model: string): boolean {
    return (VIRTUAL_MODEL_IDS as readonly string[]).includes(model);
  }

  /**
   * Route a request. Returns decision if model is virtual, null otherwise (passthrough).
   * Classify request and pick target.
   */
  decide(pathname: string, body: Record<string, unknown>): RouterDecision | null {
    const model = typeof body?.model === "string" ? body.model.trim() : "";
    if (!this.isVirtualModel(model)) return null;

    // 1. Normalize request (supports OpenAI Chat, Responses, Anthropic Messages)
    const normalized = normalizeRequest(pathname, body);

    // 2. Extract features
    const features = extractFeatures(normalized, this.config.thresholds, this.compiled);

    // 3. Make routing decision
    const routingConfig: RoutingConfig = {
      thresholds: this.config.thresholds,
      profiles: this.config.profiles,
      targets: this.config.targets,
    };

    const decision = makeDecision({
      requestedModel: model,
      features,
      routingConfig,
      hasImage: normalized.hasImage,
    });

    if (!decision) return null;

    return {
      requestedModel: model,
      target: decision.target,
      targetKey: decision.targetKey,
      task: decision.task,
      complexity: decision.complexity,
      score: decision.score,
      confidence: decision.confidence,
      reasons: decision.reasons,
      features: {
        chars: features.chars,
        estimatedTokens: features.estimatedTokens,
        ruleScore: features.ruleScore,
        ruleConfidence: features.ruleConfidence,
        hardFloor: features.hardFloor,
      },
    };
  }
}

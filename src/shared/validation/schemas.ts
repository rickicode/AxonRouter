import { z } from "zod";
import { ROUTING_STRATEGY_VALUES } from "@/shared/constants/routingStrategies";

const ROUTING_STRATEGY_ENUM_VALUES = ROUTING_STRATEGY_VALUES as [string, ...string[]];

const scoringWeightsSchema = z
  .object({
    quota: z.number().min(0).max(1),
    health: z.number().min(0).max(1),
    costInv: z.number().min(0).max(1),
    latencyInv: z.number().min(0).max(1),
    taskFit: z.number().min(0).max(1),
    stability: z.number().min(0).max(1),
    tierPriority: z.number().min(0).max(1).optional().default(0.05),
  })
  .optional();

const compositeTierEntrySchema = z
  .object({
    stepId: z.string().trim().min(1).max(200),
    fallbackTier: z.string().trim().min(1).max(100).optional(),
    label: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

const compositeTiersSchema = z
  .object({
    defaultTier: z.string().trim().min(1).max(100),
    tiers: z.record(z.string().trim().min(1).max(100), compositeTierEntrySchema),
  })
  .strict();

const comboRuntimeConfigSchema = z
  .object({
    strategy: z.enum(ROUTING_STRATEGY_ENUM_VALUES).optional(),
    maxRetries: z.coerce.number().int().min(0).max(10).optional(),
    retryDelayMs: z.coerce.number().int().min(0).max(60000).optional(),
    timeoutMs: z.coerce.number().int().min(1000).optional(),
    concurrencyPerModel: z.coerce.number().int().min(1).max(20).optional(),
    queueTimeoutMs: z.coerce.number().int().min(1000).max(120000).optional(),
    healthCheckEnabled: z.boolean().optional(),
    healthCheckTimeoutMs: z.coerce.number().int().min(100).max(30000).optional(),
    handoffThreshold: z.coerce.number().min(0.5).max(0.94).optional(),
    handoffModel: z.string().trim().max(200).optional(),
    handoffProviders: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
    maxMessagesForSummary: z.coerce.number().int().min(5).max(100).optional(),
    maxComboDepth: z.coerce.number().int().min(1).max(10).optional(),
    trackMetrics: z.boolean().optional(),
    candidatePool: z.array(z.string().min(1)).optional(),
    weights: scoringWeightsSchema.optional(),
    modePack: z.string().max(100).optional(),
    budgetCap: z.number().positive().optional(),
    explorationRate: z.number().min(0).max(1).optional(),
    routerStrategy: z.string().optional(),
    compositeTiers: compositeTiersSchema.optional(),
  })
  .strict();

const comboStepMetaSchema = {
  id: z.string().trim().min(1).max(200).optional(),
  weight: z.coerce.number().min(0).max(100).optional().default(0),
  label: z.string().trim().min(1).max(200).optional(),
};

const comboModelStepInputSchema = z.object({
  kind: z.literal("model").optional(),
  provider: z.string().trim().min(1).max(120).optional(),
  providerId: z.string().trim().min(1).max(120).optional(),
  model: z.string().trim().min(1).max(300),
  connectionId: z.string().trim().min(1).max(200).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  ...comboStepMetaSchema,
});

const comboRefStepInputSchema = z.object({
  kind: z.literal("combo-ref"),
  comboName: z.string().trim().min(1).max(100),
  ...comboStepMetaSchema,
});

const comboModelEntry = z.union([
  z.string().trim().min(1).max(300),
  comboModelStepInputSchema,
  comboRefStepInputSchema,
]);

export const comboStrategySchema = z.enum(ROUTING_STRATEGY_ENUM_VALUES);

const comboConfigSchema = comboRuntimeConfigSchema.optional().default({});

export const createComboSchema = z.object({
  id: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1, "Name is required").max(100).regex(/^[a-zA-Z0-9_.-]+$/, "Name can only contain letters, numbers, -, _ and ."),
  models: z.array(comboModelEntry).min(1, "At least one model is required").refine(
    (models) => {
      const seen = new Set<string>();
      for (const m of models) {
        let key: string;
        if (typeof m === "string") {
          key = m;
        } else if (m && typeof m === "object" && "kind" in m && m.kind === "combo-ref") {
          key = `combo-ref:${(m as any).comboName || ""}`;
        } else if (m && typeof m === "object" && "model" in m) {
          const s = m as any;
          key = `model:${s.providerId || s.provider || ""}/${s.model}:${s.connectionId || ""}`;
        } else {
          key = JSON.stringify(m);
        }
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
    { message: "Duplicate model entries are not allowed" }
  ),
  strategy: comboStrategySchema.optional().default("round-robin"),
  config: comboConfigSchema,
  allowedProviders: z.array(z.string().max(200)).optional(),
  system_message: z.string().max(50000).optional(),
  tool_filter_regex: z.string().max(1000).optional(),
  context_cache_protection: z.boolean().optional(),
  context_length: z.number().int().min(1000).max(2000000).optional(),
  isHidden: z.boolean().optional().default(false),
  priority: z.coerce.number().int().min(0).max(1000).optional().default(0),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
});

export const updateComboSchema = createComboSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

export const reorderCombosSchema = z.object({
  comboIds: z.array(z.string().trim().min(1)).min(1),
});

export const createModelComboMappingSchema = z.object({
  pattern: z.string().trim().min(1).max(500),
  comboId: z.string().trim().min(1).max(200),
  priority: z.coerce.number().int().min(-1000).max(1000).optional().default(0),
  enabled: z.boolean().optional().default(true),
  description: z.string().trim().max(1000).optional().default(""),
});

export const updateModelComboMappingSchema = createModelComboMappingSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

// Import directly from file to avoid pulling in server-side dependencies via index.js
export {
  PROVIDER_MODELS,
  getProviderModels,
  getDefaultModel,
  isValidModel as isValidModelCore,
  findModelName,
  getModelTargetFormat,
  getModelStrip,
  PROVIDER_ID_TO_ALIAS,
  getModelsByProviderId
} from "../../../open-sse/config/providerModels";

import { AI_PROVIDERS, isMorphManagedProvider, isOpenAICompatibleProvider, MORPH_MANAGED_PROVIDER_ID } from "./providers";
import { PROVIDER_MODELS as MODELS, PROVIDER_ID_TO_ALIAS as CORE_PROVIDER_ID_TO_ALIAS } from "../../../open-sse/config/providerModels";

export const MORPH_FAST_MODELS = Object.freeze([
  { id: "auto", name: "Auto (Morph Router)", owned_by: "morph", contextWindow: 8192, modalities: ["text"], routingMode: "router", isAlias: true },
  {
    id: "auto-manual",
    name: "Auto (Manual Router)",
    owned_by: "morph",
    contextWindow: 196608,
    documentedContextWindow: 262000,
    verifiedRuntimeContextWindow: 196608,
    contextWindowSource: "runtime-verified",
    modalities: ["text"],
    routingMode: "manual",
    isAlias: true,
  },
  {
    id: "morph-qwen35-397b",
    name: "Qwen 3.5 397B",
    owned_by: "morph",
    contextWindow: 196608,
    documentedContextWindow: 262000,
    verifiedRuntimeContextWindow: 196608,
    contextWindowSource: "runtime-verified",
    modalities: ["text", "image"],
    pricing: { input: 0.478, output: 3.5 },
  },
  {
    id: "morph-dsv4flash",
    name: "DeepSeek V4 Flash",
    owned_by: "morph",
    contextWindow: 393000,
    documentedContextWindow: 393000,
    contextWindowSource: "documented",
    modalities: ["text"],
    pricing: { input: 0.3, output: 0.4 },
  },
  {
    id: "morph-minimax27-230b",
    name: "MiniMax M2.7",
    owned_by: "morph",
    contextWindow: 196608,
    documentedContextWindow: 200000,
    verifiedRuntimeContextWindow: 196608,
    contextWindowSource: "runtime-verified",
    modalities: ["text"],
    pricing: { input: 0.279, output: 1.2 },
  },
  {
    id: "morph-qwen36-27b",
    name: "Qwen 3.6 27B",
    owned_by: "morph",
    contextWindow: 131072,
    documentedContextWindow: 131000,
    verifiedRuntimeContextWindow: 131072,
    contextWindowSource: "runtime-verified",
    modalities: ["text"],
    pricing: { input: 0.498, output: 2.4 },
  },
]);

export const MORPH_CORE_INTERNAL_MODELS = Object.freeze({
  applyDefault: "morph-v3-large",
  fastValidation: "morph-v3-fast",
  warpgrep: "morph-warp-grep-v2.1",
  compact: "morph-compactor",
});

export const MORPH_FAST_MODEL_IDS = new Set(MORPH_FAST_MODELS.map((model) => model.id));

export function getMorphFastModels() {
  return MORPH_FAST_MODELS.map((model) => ({ ...model }));
}

export function isMorphFastModel(modelId) {
  return typeof modelId === "string" && MORPH_FAST_MODEL_IDS.has(modelId.trim());
}

export function getMorphFastModel(modelId) {
  if (!isMorphFastModel(modelId)) return null;
  return MORPH_FAST_MODELS.find((model) => model.id === modelId.trim()) || null;
}

export function isMorphAutoModel(modelId) {
  const normalized = typeof modelId === "string" ? modelId.trim() : "";
  return normalized === "auto" || normalized === "auto-manual";
}

export const EXTENDED_PROVIDER_ID_TO_ALIAS = {
  ...CORE_PROVIDER_ID_TO_ALIAS,
  [MORPH_MANAGED_PROVIDER_ID]: "morph",
};

// Providers that accept any model (passthrough)
const PASSTHROUGH_PROVIDERS = new Set(
  Object.entries(AI_PROVIDERS)
    .filter(([, provider]) => (provider as any)?.passthroughModels === true)
    .map(([key]) => key)
);

// Wrap isValidModel with passthrough providers
export function isValidModel(aliasOrId, modelId) {
  if (isMorphManagedProvider(aliasOrId) || aliasOrId === "morph") {
    return isMorphFastModel(modelId);
  }
  if (isOpenAICompatibleProvider(aliasOrId)) return true;
  if (PASSTHROUGH_PROVIDERS.has(aliasOrId)) return true;
  const models = MODELS[aliasOrId];
  if (!models) return false;
  return models.some(m => m.id === modelId);
}

// Legacy AI_MODELS for backward compatibility
export const AI_MODELS = [
  ...Object.entries(MODELS).flatMap(([alias, models]) =>
    models.map(m => ({ provider: alias, model: m.id, name: m.name }))
  ),
  ...MORPH_FAST_MODELS.map((model) => ({
    provider: "morph",
    model: model.id,
    name: model.name,
  })),
];

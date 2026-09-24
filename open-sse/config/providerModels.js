import { PROVIDERS } from "./providers.js";
import REGISTRY from "../providers/registry/index.js";
// PROVIDER_MODELS now built from providers/registry (transport + models co-located)
import { PROVIDER_MODELS } from "../providers/index.js";
import { modelQuotaFamily, modelStrip, modelTargetFormat, modelSupportedFormats, normalizeModelId } from "../providers/models/schema.js";
import { CODEX_REVIEW_SUFFIX, isMuseSparkModel } from "../providers/models/helpers.js";
import { FORMATS } from "../translator/formats.js";
import { resolveProviderAlias } from "../services/model.js";
export { PROVIDER_MODELS };


// Helper functions
export function getProviderModels(aliasOrId) {
  return PROVIDER_MODELS[aliasOrId] || PROVIDER_MODELS[resolveProviderAlias(aliasOrId)] || [];
}

export function getDefaultModel(aliasOrId) {
  const models = getProviderModels(aliasOrId);
  return models?.[0]?.id || null;
}

// Providers whose registry uses dots in version numbers (e.g. "claude-sonnet-4.5").
// For these, we tolerate clients sending dashes ("claude-sonnet-4-5") by normalizing
// digit-hyphen-digit to digit-dot-digit before lookup. Other providers are left untouched.
const DOT_VERSION_PROVIDERS = new Set(["kr", "kiro"]);

// Find a registry entry by id. For Kiro models, tolerates dash/dot version separators
// ("claude-sonnet-4-5" ~= "claude-sonnet-4.5"). Other providers use exact match only.
function findModel(models, modelId, aliasOrId) {
  if (!models) return undefined;
  let found = models.find(m => m.id === modelId);
  if (found) return found;

  // Match by alias or aliases array
  found = models.find(m => m.alias === modelId || (Array.isArray(m.aliases) && m.aliases.includes(modelId)));
  if (found) return found;

  // Short name without vendor prefix (e.g. "solar-pro4" matches "upstage/solar-pro4", "deepseek-v4.1-flash" matches "deepseek/deepseek-v4.1-flash")
  if (typeof modelId === "string" && !modelId.includes("/")) {
    found = models.find(m => typeof m.id === "string" && (m.id.endsWith("/" + modelId) || m.id.endsWith("/" + modelId + ":free")));
    if (found) return found;
  }

  // Tolerant :free suffix (e.g. "poolside/laguna-s-2.1" matches "poolside/laguna-s-2.1:free" or vice versa)
  if (typeof modelId === "string") {
    if (modelId.endsWith(":free")) {
      const withoutFree = modelId.slice(0, -5);
      found = models.find(m => m.id === withoutFree || (typeof m.id === "string" && m.id.endsWith("/" + withoutFree)));
      if (found) return found;
    } else {
      found = models.find(m => m.id === `${modelId}:free` || (typeof m.id === "string" && m.id.endsWith(`/${modelId}:free`)));
      if (found) return found;
    }
  }

  if (!DOT_VERSION_PROVIDERS.has(aliasOrId)) return undefined;
  const normalized = normalizeModelId(modelId);
  if (normalized === modelId) return undefined;
  return models.find(m => m.id === normalized);
}

export function isValidModel(aliasOrId, modelId, passthroughProviders = new Set()) {
  if (passthroughProviders.has(aliasOrId)) return true;
  const models = PROVIDER_MODELS[aliasOrId];
  if (!models) return false;
  return !!findModel(models, modelId, aliasOrId);
}

export function findModelName(aliasOrId, modelId) {
  const models = PROVIDER_MODELS[aliasOrId];
  if (!models) return modelId;
  const found = findModel(models, modelId, aliasOrId);
  return found?.name || modelId;
}

function stripThinkingSuffix(modelId) {
  if (typeof modelId !== "string") return modelId;
  const sufMatch = modelId.match(/\([^()]+\)\s*$/);
  return sufMatch ? modelId.slice(0, sufMatch.index).trim() : modelId;
}

export function getModelTargetFormat(aliasOrId, modelId) {
  if ((!aliasOrId || aliasOrId === "oc" || aliasOrId === "opencode" || aliasOrId === "ocg" || aliasOrId === "opencode-go" || aliasOrId === "ocz" || aliasOrId === "opencode-zen" || aliasOrId === "zen") && isMuseSparkModel(modelId)) {
    return FORMATS.OPENAI_RESPONSES;
  }
  const models = PROVIDER_MODELS[aliasOrId] || PROVIDER_MODELS[resolveProviderAlias(aliasOrId)];
  if (!models) return null;
  return modelTargetFormat(findModel(models, stripThinkingSuffix(modelId), aliasOrId));
}

// Declared upstream formats for a model (registry `supportedFormats`). Drives the
// per-model guard on the sourceFormat-matched transport; null when undeclared.
export function getModelSupportedFormats(aliasOrId, modelId) {
  const models = PROVIDER_MODELS[aliasOrId] || PROVIDER_MODELS[resolveProviderAlias(aliasOrId)];
  if (!models) return null;
  return modelSupportedFormats(findModel(models, stripThinkingSuffix(modelId), aliasOrId));
}

export function getModelType(aliasOrId, modelId) {
  const models = PROVIDER_MODELS[aliasOrId];
  if (!models) return null;
  const found = findModel(models, modelId, aliasOrId);
  return found?.kind || found?.type || null;
}

const KNOWN_PREFIXLESS_MODELS = {
  "deepseek-v4.1-flash": "deepseek/deepseek-v4.1-flash",
  "deepseek-v4-flash": "deepseek/deepseek-v4-flash",
  "solar-pro4": "upstage/solar-pro4",
  "solar-pro-3": "upstage/solar-pro-3",
  "muse-spark-1.3-contributor": "meta/muse-spark-1.3-contributor",
  "muse-spark-1.2-contributor": "meta/muse-spark-1.2-contributor",
  "laguna-s-2.1": "poolside/laguna-s-2.1:free",
  "laguna-s-2.1:free": "poolside/laguna-s-2.1:free",
  "laguna-xs-2.1": "poolside/laguna-xs-2.1:free",
  "laguna-xs-2.1:free": "poolside/laguna-xs-2.1:free",
  "glm-5.3-flash": "z-ai/glm-5.3-flash",
  "glm-5.2": "z-ai/glm-5.2:free",
};
export function getModelUpstreamId(aliasOrId, modelId) {
  // Split off thinking suffix "(level)" so lookup hits the base id; re-append it to
  // the result so downstream applyThinking still sees the suffix (body.model is stripped separately).
  const sufMatch = typeof modelId === "string" ? modelId.match(/\([^()]+\)\s*$/) : null;
  const suffix = sufMatch ? sufMatch[0] : "";
  const baseId = suffix ? modelId.slice(0, sufMatch.index).trim() : modelId;
  const models = PROVIDER_MODELS[aliasOrId] || PROVIDER_MODELS[resolveProviderAlias(aliasOrId)];
  const found = findModel(models, baseId, aliasOrId);
  const resolvedId = found?.upstreamModelId || found?.id;
  if (resolvedId) {
    const presetMatch = resolvedId.match(/\([^()]+\)\s*$/);
    const presetSuffix = presetMatch?.[0] || "";
    const resolvedBase = presetSuffix ? resolvedId.slice(0, presetMatch.index).trim() : resolvedId;
    return resolvedBase + (suffix || presetSuffix);
  }
  // Custom compatible nodes are transparent proxies — the model id must reach
  // upstream unchanged. Never rewrite via KNOWN_PREFIXLESS_MODELS for these.
  const isCompatibleNode = typeof aliasOrId === "string" && (
    aliasOrId.startsWith("openai-compatible-") ||
    aliasOrId.startsWith("anthropic-compatible-")
  );
  if (!isCompatibleNode && KNOWN_PREFIXLESS_MODELS[baseId]) {
    return KNOWN_PREFIXLESS_MODELS[baseId] + suffix;
  }
  if (aliasOrId === "cx" && typeof baseId === "string" && baseId.endsWith(CODEX_REVIEW_SUFFIX)) {
    return baseId.slice(0, -CODEX_REVIEW_SUFFIX.length) + suffix;
  }
  return baseId + suffix;
}

export function getModelQuotaFamily(aliasOrId, modelId) {
  const models = PROVIDER_MODELS[aliasOrId];
  return modelQuotaFamily(findModel(models, modelId, aliasOrId));
}

// OAuth short aliases — derived from registry `alias` (single source). everything else: alias = id.
// vertex/vertex-partner keep alias=id (kept via the `|| id` fallback in consumers).
export const OAUTH_ALIASES = Object.fromEntries(
  REGISTRY.filter(r => r.alias && r.alias !== r.id).map(r => [r.id, r.alias])
);

// Derived from PROVIDERS — no need to maintain manually
export const PROVIDER_ID_TO_ALIAS = Object.fromEntries(
  Object.keys(PROVIDERS).map(id => [id, OAUTH_ALIASES[id] || id])
);

export function getModelsByProviderId(providerId) {
  const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
  return PROVIDER_MODELS[alias] || PROVIDER_MODELS[resolveProviderAlias(providerId)] || [];
}

// Get strip list for a model entry (explicit opt-in only)
// Returns array of content types to strip, e.g. ["image", "audio"]
export function getModelStrip(alias, modelId) {
  return modelStrip(findModel(PROVIDER_MODELS[alias], modelId, alias));
}

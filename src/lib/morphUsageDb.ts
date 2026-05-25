import { MORPH_CORE_INTERNAL_MODELS } from "../shared/constants/models";
import { getMorphRecentRequestsFromDb, getMorphUsageStatsFromDb } from "./usageDb/queries/index";
import { drainUsageQueue } from "./usageDb/backgroundQueue";
import { queueMorphUsageEvent } from "./usageDb/queueFacade";

const ENABLE_USAGE_SQLITE_WRITE = true;
const isCloud = typeof caches !== "undefined" && typeof caches === "object";

const PERIOD_MS = { "24h": 86400000, "7d": 604800000, "30d": 2592000000, "60d": 5184000000 };

const MORPH_PRICING = Object.freeze({
  [MORPH_CORE_INTERNAL_MODELS.fastValidation]: { input: 0.8, output: 1.2 },
  [MORPH_CORE_INTERNAL_MODELS.applyDefault]: { input: 0.9, output: 1.9 },
  [MORPH_CORE_INTERNAL_MODELS.warpgrep]: { input: 0.8, output: 0.8 },
  [MORPH_CORE_INTERNAL_MODELS.compact]: { input: 0.2, output: 0.5 },
});

export const MORPH_CAPABILITY_DEFAULT_MODELS = Object.freeze({
  apply: MORPH_CORE_INTERNAL_MODELS.applyDefault,
  warpgrep: MORPH_CORE_INTERNAL_MODELS.warpgrep,
  compact: MORPH_CORE_INTERNAL_MODELS.compact,
});

function getLocalDateKey(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDailySummaryBucketTime(dateKey) {
  const parts = String(dateKey).split("-");
  if (parts.length !== 3) return NaN;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return NaN;
  return new Date(year, month - 1, day).getTime();
}

function getPeriodStart(period, nowMs) {
  const duration = PERIOD_MS[period];
  return typeof duration === "number" ? nowMs - duration : null;
}

function isTimestampInPeriod(timestamp, period, nowMs) {
  const entryTime = new Date(timestamp).getTime();
  if (!Number.isFinite(entryTime) || entryTime > nowMs) return false;
  const periodStart = getPeriodStart(period, nowMs);
  if (periodStart === null) return true;
  return entryTime >= periodStart;
}

function normalizeMorphTokens(tokens: any = {}) {
  const inputTokens = Number(tokens.prompt_tokens ?? tokens.input_tokens ?? 0) || 0;
  const outputTokens = Number(tokens.completion_tokens ?? tokens.output_tokens ?? 0) || 0;
  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
}

function resolveMorphPricing(capability, model) {
  const normalizedModel = typeof model === "string" ? model.trim() : "";
  if (normalizedModel && MORPH_PRICING[normalizedModel]) {
    return { model: normalizedModel, pricing: MORPH_PRICING[normalizedModel] };
  }

  const fallbackModel = MORPH_CAPABILITY_DEFAULT_MODELS[capability] || "";
  return {
    model: fallbackModel,
    pricing: MORPH_PRICING[fallbackModel] || null,
  };
}

export function getDefaultMorphModel(capability) {
  return MORPH_CAPABILITY_DEFAULT_MODELS[capability] || null;
}

export function calculateMorphCredits({ capability, model, tokens }) {
  const normalizedTokens = normalizeMorphTokens(tokens);
  const { model: resolvedModel, pricing } = resolveMorphPricing(capability, model);
  if (!pricing) {
    return { model: resolvedModel || model || null, dollars: 0, credits: 0 };
  }

  const inputCost = (normalizedTokens.input_tokens * pricing.input) / 1000000;
  const outputCost = (normalizedTokens.output_tokens * pricing.output) / 1000000;
  const dollars = inputCost + outputCost;
  const credits = dollars / 0.00001;

  return {
    model: resolvedModel || model || null,
    dollars: Number(dollars.toFixed(10)),
    credits: Number(credits.toFixed(4)),
  };
}

function addToCounter(target, key, values, meta = {}) {
  if (!target[key]) {
    target[key] = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      credits: 0,
      ...meta,
    };
  }

  target[key].requests += values.requests || 0;
  target[key].inputTokens += values.inputTokens || 0;
  target[key].outputTokens += values.outputTokens || 0;
  target[key].credits += values.credits || 0;
}

function aggregateEntryToDailySummary(dailySummary, entry) {
  const dateKey = getLocalDateKey(entry.timestamp);
  if (!dailySummary[dateKey]) {
    dailySummary[dateKey] = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      credits: 0,
      byCapability: {},
      byModel: {},
      byApiKey: {},
      byEntrypoint: {},
    };
  }

  const day = dailySummary[dateKey];
  day.byCapability ||= {};
  day.byModel ||= {};
  day.byApiKey ||= {};
  day.byEntrypoint ||= {};
  const inputTokens = entry.tokens?.input_tokens || entry.tokens?.prompt_tokens || 0;
  const outputTokens = entry.tokens?.output_tokens || entry.tokens?.completion_tokens || 0;
  const values = {
    requests: 1,
    inputTokens,
    outputTokens,
    credits: entry.credits || 0,
  };

  day.requests += values.requests;
  day.inputTokens += values.inputTokens;
  day.outputTokens += values.outputTokens;
  day.credits += values.credits;

  addToCounter(day.byCapability, entry.capability || "unknown", values, {
    capability: entry.capability || "unknown",
  });
  addToCounter(day.byModel, entry.model || "unknown", values, {
    model: entry.model || "unknown",
    resolvedModel: entry.resolvedModel || entry.model || "unknown",
    requestedModel: entry.requestedModel || entry.model || "unknown",
  });
  addToCounter(day.byApiKey, entry.apiKeyLabel || "Unknown email", values, {
    apiKeyLabel: entry.apiKeyLabel || "Unknown email",
  });
  addToCounter(day.byEntrypoint, entry.entrypoint || "unknown", values, {
    entrypoint: entry.entrypoint || "unknown",
  });
}

export function maskMorphApiKey(apiKey) {
  if (typeof apiKey !== "string") return "Unknown email";
  const trimmed = apiKey.trim();
  if (!trimmed) return "Unknown email";
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export async function resetMorphUsageDbForTests() {
  await drainUsageQueue();
}

export async function saveMorphUsage(entry: any, options: any = {}) {
  if (isCloud) return null;

  try {
    const timestamp = entry.timestamp || new Date().toISOString();
    const tokens = normalizeMorphTokens(entry.tokens);
    const pricing = calculateMorphCredits({
      capability: entry.capability,
      model: entry.model,
      tokens,
    });

    const category = entry.category || "request";
    const resolvedModel = entry.resolvedModel || pricing.model || entry.model || null;
    const requestedModel = entry.requestedModel || entry.model || resolvedModel;
    const record = {
      provider: category === "fast-model" ? "morph-fast" : "morph",
      status: entry.status || "ok",
      timestamp,
      capability: entry.capability || "unknown",
      entrypoint: entry.entrypoint || "unknown",
      source: entry.source || "unknown",
      method: entry.method || "POST",
      model: pricing.model || entry.model || null,
      resolvedModel,
      requestedModel,
      apiKeyLabel: entry.apiKeyLabel || maskMorphApiKey(entry.apiKey),
      upstreamStatus: entry.upstreamStatus ?? null,
      credits: pricing.credits,
      dollars: pricing.dollars,
      tokens,
      error: entry.error || null,
      category,
      metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : null,
    };

    if (ENABLE_USAGE_SQLITE_WRITE && record) {
      queueMorphUsageEvent(record);
    }

    return record;
  } catch (error) {
    console.error("[morphUsageDb] Failed to save Morph usage:", error);
    if (options.propagateError) throw error;
    return null;
  }
}

export async function getMorphRecentRequests(limit = 100) {
  await drainUsageQueue();
  return getMorphRecentRequestsFromDb(limit);
}

export async function getMorphUsageStats(period = "7d") {
  await drainUsageQueue();
  return getMorphUsageStatsFromDb(period);
}

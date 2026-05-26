import crypto from "node:crypto";
import { normalizeModelName, normalizeUsageTokens } from "../usage/costCalculator";

function toIsoTimestamp(value: any) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function toSafeString(value: any, fallback: string | null = null) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function toInteger(value: any, fallback: number | null = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toNumber(value: any, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildHash(value: any) {
  if (!value) return null;
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function buildUsageEventId(payload: any) {
  if (payload?.id && typeof payload.id === "string") return payload.id;
  const rawId = [
    payload?.timestamp,
    payload?.provider,
    payload?.model,
    payload?.connectionId,
    payload?.apiKeyId,
    payload?.endpoint,
    JSON.stringify(payload?.tokens || {}),
    payload?.status,
    payload?.source,
    payload?.category,
  ].join("|");
  return `usage-${crypto.createHash("sha1").update(rawId).digest("hex")}`;
}

export function normalizeUsageEvent(entry: any = {}, options: any = {}) {
  const timestamp = toIsoTimestamp(entry.timestamp);
  const tokens = normalizeUsageTokens(entry.tokens || {});
  const provider = toSafeString(entry.provider, "unknown");
  const model = toSafeString(entry.model, "unknown");
  const status = toSafeString(entry.status, "ok");
  const success = typeof entry.success === "boolean"
    ? entry.success
    : !String(status).toLowerCase().startsWith("failed") && !entry.error;
  const explicitTotalTokens = toInteger(
    entry.tokens?.total_tokens ?? entry.tokens?.totalTokens,
    null,
  );

  return {
    kind: "usage",
    id: buildUsageEventId({ ...entry, timestamp, provider, model, source: options.source || entry.source || "general" }),
    timestamp,
    provider,
    model,
    normalizedModel: normalizeModelName(model) || model,
    connectionId: toSafeString(entry.connectionId),
    accountNameCache: toSafeString(entry.accountName),
    apiKeyId: toSafeString(entry.apiKeyId),
    apiKeyNameCache: toSafeString(entry.apiKeyName),
    apiKeyValueHash: buildHash(entry.apiKeyValue || entry.apiKey),
    endpoint: toSafeString(entry.endpoint, "Unknown"),
    status,
    success: success ? 1 : 0,
    tokensInput: toInteger(tokens.input),
    tokensOutput: toInteger(tokens.output),
    tokensCacheRead: toInteger(tokens.cacheRead),
    tokensCacheCreation: toInteger(tokens.cacheCreation),
    tokensReasoning: toInteger(tokens.reasoning),
    totalTokens: explicitTotalTokens,
    costTotal: toNumber(entry.cost?.total ?? entry.cost, 0),
    latencyMs: toInteger(entry.latencyMs ?? entry.latency),
    ttftMs: toInteger(entry.timeToFirstTokenMs ?? entry.ttftMs),
    source: toSafeString(options.source || entry.source, "general"),
    category: toSafeString(entry.category),
    errorCode: toSafeString(entry.errorCode || entry.error),
    createdAt: new Date().toISOString(),
  };
}

export function normalizeMorphUsageEvent(entry: any = {}) {
  return normalizeUsageEvent({
    ...entry,
    provider: entry.provider || (entry.category === "fast-model" ? "morph-fast" : "morph"),
    model: entry.resolvedModel || entry.model || "unknown",
    apiKeyName: entry.apiKeyLabel,
    endpoint: entry.entrypoint || entry.endpoint || "unknown",
    status: entry.status || "ok",
  }, { source: "morph" });
}

export function normalizeRequestLogEvent(entry: any = {}, options: any = {}) {
  const timestamp = toIsoTimestamp(entry.timestamp);
  const tokens = normalizeUsageTokens(entry.tokens || {});

  return {
    kind: "log",
    timestamp,
    requestId: toSafeString(entry.requestId),
    provider: toSafeString(entry.provider),
    model: toSafeString(entry.model),
    connectionId: toSafeString(entry.connectionId),
    status: toSafeString(entry.status, "UNKNOWN"),
    promptTokens: toInteger(tokens.input, null),
    completionTokens: toInteger(tokens.output, null),
    source: toSafeString(options.source || entry.source, "general"),
    metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
  };
}

export function buildDailySummaryDimensions(event: any) {
  const date = String(event.timestamp).slice(0, 10);
  return {
    date,
    provider: event.provider || "",
    model: event.model || "",
    normalizedModel: event.normalizedModel || "",
    connectionId: event.connectionId || "",
    accountNameCache: event.accountNameCache || "",
    apiKeyId: event.apiKeyId || "",
    apiKeyNameCache: event.apiKeyNameCache || "",
    endpoint: event.endpoint || "",
    source: event.source || "general",
  };
}

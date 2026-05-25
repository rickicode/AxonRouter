import { ensureUsageSchema } from "../bootstrap";
import { getUsageDbInstance, prepareUsageStatement } from "../core";

type MorphUsageRow = {
  timestamp?: string;
  category?: string;
  endpoint?: string;
  source?: string;
  model?: string;
  api_key_name_cache?: string;
  tokens_input?: number | string;
  tokens_output?: number | string;
  status?: string;
  error_code?: string | null;
};

function toMorphRows(value: unknown): MorphUsageRow[] {
  return Array.isArray(value) ? (value as MorphUsageRow[]) : [];
}

function mapMorphRecentRow(row: MorphUsageRow) {
  return {
    timestamp: row.timestamp,
    capability: row.category || "unknown",
    entrypoint: row.endpoint || "unknown",
    source: row.source || "morph",
    method: "POST",
    model: row.model,
    resolvedModel: row.model,
    requestedModel: row.model,
    apiKeyLabel: row.api_key_name_cache || "Unknown email",
    inputTokens: Number(row.tokens_input || 0),
    outputTokens: Number(row.tokens_output || 0),
    credits: 0,
    status: row.status || "ok",
    upstreamStatus: null,
    error: row.error_code || null,
  };
}

export function getMorphRecentRequestsFromDb(limit = 100) {
  ensureUsageSchema(getUsageDbInstance());
  const rows = toMorphRows(prepareUsageStatement(`
    SELECT *
    FROM usage_events
    WHERE source = 'morph' AND category != 'auto_compact'
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit));
  return rows.map(mapMorphRecentRow);
}

export function getMorphUsageStatsFromDb(period = "7d") {
  ensureUsageSchema(getUsageDbInstance());
  const now = Date.now();
  const stats = {
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCredits: 0,
    totalRequestsLifetime: 0,
    byCapability: {},
    byModel: {},
    byApiKey: {},
    byEntrypoint: {},
    recentRequests: getMorphRecentRequestsFromDb(20),
  };

  const sinceIso = period === "24h"
    ? new Date(now - 24 * 60 * 60 * 1000).toISOString()
    : new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const rows = toMorphRows(prepareUsageStatement(`SELECT category, model, api_key_name_cache, endpoint, tokens_input, tokens_output, status, error_code, timestamp FROM usage_events WHERE source = 'morph' AND category != 'auto_compact' AND timestamp >= ? ORDER BY timestamp ASC`).all(sinceIso));

  const lifetimeCountRow = prepareUsageStatement(`SELECT COUNT(*) AS count FROM usage_events WHERE source = 'morph' AND category != 'auto_compact'`).get() as { count?: number } | undefined;
  stats.totalRequestsLifetime = Number(lifetimeCountRow?.count || 0);

  for (const row of rows) {
    const capability = row.category || "unknown";
    const model = row.model || "unknown";
    const apiKeyLabel = row.api_key_name_cache || "Unknown email";
    const entrypoint = row.endpoint || "unknown";
    const inputTokens = Number(row.tokens_input || 0);
    const outputTokens = Number(row.tokens_output || 0);
    const credits = 0;

    stats.totalRequests += 1;
    stats.totalInputTokens += inputTokens;
    stats.totalOutputTokens += outputTokens;
    stats.totalCredits += credits;

    const add = (target: Record<string, any>, key: string, payload: Record<string, unknown>) => {
      if (!target[key]) target[key] = { requests: 0, inputTokens: 0, outputTokens: 0, credits: 0, ...payload };
      target[key].requests += 1;
      target[key].inputTokens += inputTokens;
      target[key].outputTokens += outputTokens;
      target[key].credits += credits;
    };

    add(stats.byCapability, capability, { capability });
    add(stats.byModel, model, { model });
    add(stats.byApiKey, apiKeyLabel, { apiKeyLabel });
    add(stats.byEntrypoint, entrypoint, { entrypoint });
  }

  return stats;
}

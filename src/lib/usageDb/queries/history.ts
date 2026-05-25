import { prepareUsageStatement } from "../core";
import { normalizeModelName } from "../../usage/costCalculator";

function buildWhereClause(options: any = {}) {
  const clauses = [];
  const params = [];

  if (options.provider) {
    clauses.push("provider = ?");
    params.push(options.provider);
  }
  if (options.model) {
    clauses.push("model = ?");
    params.push(options.model);
  }
  if (options.startDate) {
    clauses.push("timestamp >= ?");
    params.push(new Date(options.startDate).toISOString());
  }
  if (options.endDate) {
    clauses.push("timestamp <= ?");
    params.push(new Date(options.endDate).toISOString());
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function mapGeneralRow(row: any) {
  return {
    timestamp: row.timestamp || null,
    provider: row.provider || "unknown",
    model: row.model || "unknown",
    normalizedModel: normalizeModelName(row.model || "unknown"),
    status: row.status || "ok",
    endpoint: row.endpoint || "Unknown",
    connectionId: row.connection_id || null,
    accountName: row.account_name_cache || null,
    apiKeyId: row.api_key_id || null,
    apiKeyName: row.api_key_name_cache || null,
    apiKeyValue: null,
    tokens: {
      input: Number(row.tokens_input || 0),
      output: Number(row.tokens_output || 0),
      cacheRead: Number(row.tokens_cache_read || 0),
      cacheCreation: Number(row.tokens_cache_creation || 0),
      reasoning: Number(row.tokens_reasoning || 0),
    },
    cost: {
      total: Number(row.cost_total || 0),
    },
    meta: {
      isMorph: row.source === "morph",
      capability: row.category || null,
      entrypoint: row.endpoint || null,
      source: row.source || null,
      category: row.category || null,
      requestedModel: row.model || null,
      resolvedModel: row.model || null,
      credits: null,
    },
  };
}

export function getCanonicalUsageRowsFromDb(options: any = {}) {
  const { whereClause, params } = buildWhereClause(options);
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 10000;
  const rows = prepareUsageStatement(`
    SELECT *
    FROM usage_events
    ${whereClause}
    ORDER BY timestamp ASC
    LIMIT ?
  `).all(...params, limit) as any[];
  return rows.map(mapGeneralRow);
}

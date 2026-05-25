import { calculateCost } from "../usage/costCalculator";
import { ensureUsageSchema } from "./bootstrap";
import { getUsageDbInstance } from "./core";
import { buildDailySummaryDimensions } from "./events";

function insertUsageEvent(db, event) {
  const totalTokens = event.totalTokens ?? (
    event.tokensInput
    + event.tokensOutput
    + event.tokensCacheRead
    + event.tokensCacheCreation
    + event.tokensReasoning
  );
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO usage_events (
      id, timestamp, provider, model, normalized_model, connection_id,
      account_name_cache, api_key_id, api_key_name_cache, api_key_value_hash,
      endpoint, status, success, tokens_input, tokens_output, tokens_cache_read,
      tokens_cache_creation, tokens_reasoning, total_tokens, cost_total, latency_ms, ttft_ms,
      source, category, cloud_worker_id, error_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    event.id,
    event.timestamp,
    event.provider,
    event.model,
    event.normalizedModel,
    event.connectionId,
    event.accountNameCache,
    event.apiKeyId,
    event.apiKeyNameCache,
    event.apiKeyValueHash,
    event.endpoint,
    event.status,
    event.success,
    event.tokensInput,
    event.tokensOutput,
    event.tokensCacheRead,
    event.tokensCacheCreation,
    event.tokensReasoning,
    totalTokens,
    event.costTotal,
    event.latencyMs,
    event.ttftMs,
    event.source,
    event.category,
    event.cloudWorkerId,
    event.errorCode,
    event.createdAt
  );
}

function upsertDailySummary(db, event) {
  const dims = buildDailySummaryDimensions(event);
  const totalTokens = event.totalTokens ?? (event.tokensInput + event.tokensOutput);
  const stmt = db.prepare(`
    INSERT INTO usage_daily_summary (
      date, provider, model, normalized_model, connection_id, account_name_cache,
      api_key_id, api_key_name_cache, endpoint, source,
      requests, prompt_tokens, completion_tokens, cache_read_tokens,
      cache_creation_tokens, reasoning_tokens, total_tokens, cost_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, provider, model, connection_id, api_key_id, endpoint, source)
    DO UPDATE SET
      normalized_model = excluded.normalized_model,
      account_name_cache = excluded.account_name_cache,
      api_key_name_cache = excluded.api_key_name_cache,
      requests = usage_daily_summary.requests + excluded.requests,
      prompt_tokens = usage_daily_summary.prompt_tokens + excluded.prompt_tokens,
      completion_tokens = usage_daily_summary.completion_tokens + excluded.completion_tokens,
      cache_read_tokens = usage_daily_summary.cache_read_tokens + excluded.cache_read_tokens,
      cache_creation_tokens = usage_daily_summary.cache_creation_tokens + excluded.cache_creation_tokens,
      reasoning_tokens = usage_daily_summary.reasoning_tokens + excluded.reasoning_tokens,
      total_tokens = usage_daily_summary.total_tokens + excluded.total_tokens,
      cost_total = usage_daily_summary.cost_total + excluded.cost_total
  `);

  stmt.run(
    dims.date,
    dims.provider,
    dims.model,
    dims.normalizedModel,
    dims.connectionId,
    dims.accountNameCache,
    dims.apiKeyId,
    dims.apiKeyNameCache,
    dims.endpoint,
    dims.source,
    1,
    event.tokensInput,
    event.tokensOutput,
    event.tokensCacheRead,
    event.tokensCacheCreation,
    event.tokensReasoning,
    totalTokens,
    event.costTotal
  );
}

function insertRequestLog(db, event) {
  const stmt = db.prepare(`
    INSERT INTO usage_request_logs (
      timestamp, request_id, provider, model, connection_id, status,
      prompt_tokens, completion_tokens, source, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    event.timestamp,
    event.requestId,
    event.provider,
    event.model,
    event.connectionId,
    event.status,
    event.promptTokens,
    event.completionTokens,
    event.source,
    event.metadataJson
  );
}

async function ensureUsageEventCost(event) {
  if (event.costTotal > 0) return event;
  const calculated = await calculateCost(event.provider, event.model, {
    input: event.tokensInput,
    output: event.tokensOutput,
    cacheRead: event.tokensCacheRead,
    cacheCreation: event.tokensCacheCreation,
    reasoning: event.tokensReasoning,
  });
  return { ...event, costTotal: calculated || 0 };
}

export async function flushUsageWriteBatch(batch) {
  const db = getUsageDbInstance();
  ensureUsageSchema(db);
  const usageEvents = [];
  const requestLogs = [];

  for (const item of batch) {
    if (item?.kind === "usage") {
      usageEvents.push(await ensureUsageEventCost(item));
    } else if (item?.kind === "log") {
      requestLogs.push(item);
    }
  }

  const flushTransaction = db.transaction(() => {
    for (const event of usageEvents) {
      insertUsageEvent(db, event);
      upsertDailySummary(db, event);
    }
    for (const logEvent of requestLogs) {
      insertRequestLog(db, logEvent);
    }
  });

  flushTransaction();

  return {
    usageEvents: usageEvents.length,
    requestLogs: requestLogs.length,
  };
}

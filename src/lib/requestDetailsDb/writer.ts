import { prepareRequestDetailsStatement } from "./core";
import { deleteRequestDetailPayloadFiles, readRequestDetailPayloadFile, writeRequestDetailPayloadFiles } from "./payloadStore";

const MAX_REQUEST_DETAIL_RECORDS = parseInt(process.env.OBSERVABILITY_MAX_RECORDS || "500", 10);

function findTrace(detail) {
  return detail?.providerResponse?.trace
    || detail?.response?.trace
    || detail?.request?.trace
    || null;
}

function findCorrelationId(detail, trace = findTrace(detail)) {
  return detail?.correlationId
    || detail?.request?.correlation_id
    || detail?.request?.correlationId
    || detail?.response?.correlation_id
    || detail?.response?.correlationId
    || detail?.providerResponse?.correlation_id
    || detail?.providerResponse?.correlationId
    || trace?.correlation_id
    || trace?.correlationId
    || null;
}

function buildIndexedTokens(tokens) {
  if (!tokens || typeof tokens !== "object") {
    return { promptTokens: 0, completionTokens: 0, usagePresent: false };
  }

  const promptValue = tokens.prompt_tokens ?? tokens.input_tokens;
  const completionValue = tokens.completion_tokens ?? tokens.output_tokens;
  const usagePresent = [
    "prompt_tokens",
    "input_tokens",
    "completion_tokens",
    "output_tokens",
    "total_tokens",
    "cached_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "reasoning_tokens",
  ].some((key) => tokens[key] !== undefined && tokens[key] !== null);

  return {
    promptTokens: promptValue === undefined || promptValue === null ? 0 : Number(promptValue),
    completionTokens: completionValue === undefined || completionValue === null ? 0 : Number(completionValue),
    usagePresent,
  };
}

function buildIndexedLatency(latency) {
  if (!latency || typeof latency !== "object") {
    return { ttft: 0, total: null };
  }

  const ttftValue = latency.ttft;
  const totalValue = latency.total;

  return {
    ttft: ttftValue === undefined || ttftValue === null ? 0 : Number(ttftValue),
    total: totalValue === undefined || totalValue === null ? null : Number(totalValue),
  };
}

function buildHydratedLatency(row) {
  return {
    ...(row.latency_ttft_ms === null || row.latency_ttft_ms === undefined ? {} : { ttft: Number(row.latency_ttft_ms) }),
    ...(row.latency_total_ms === null || row.latency_total_ms === undefined ? {} : { total: Number(row.latency_total_ms) }),
  };
}

function buildTraceSummary(trace, row) {
  const fallbackEventCount = Array.isArray(trace?.events) ? trace.events.length : 0;
  const rowEventCount = row.trace_event_count === null || row.trace_event_count === undefined ? null : Number(row.trace_event_count);
  const hasIndexedTrace = Boolean(row.trace_mode || row.trace_last_event_type || rowEventCount);
  const eventCount = hasIndexedTrace ? (rowEventCount ?? fallbackEventCount) : fallbackEventCount;
  const lastEventType = row.trace_last_event_type
    || (fallbackEventCount > 0 ? trace.events[fallbackEventCount - 1]?.type || null : null);
  const mode = row.trace_mode || trace?.mode || null;

  if (!mode && !lastEventType && eventCount === 0) return null;

  return {
    eventCount,
    lastEventType,
    mode,
  };
}

function upsertRequestDetailIndex(detail, payloadResult) {
  const trace = findTrace(detail);
  const correlationId = findCorrelationId(detail, trace);
  const traceEventCount = Array.isArray(trace?.events) ? trace.events.length : 0;
  const traceLastEventType = traceEventCount > 0 ? trace.events[trace.events.length - 1]?.type || null : null;
  const indexedTokens = buildIndexedTokens(detail?.tokens);
  const indexedLatency = buildIndexedLatency(detail?.latency);

  const stmt = prepareRequestDetailsStatement(`
    INSERT OR REPLACE INTO request_details_index (
      id, timestamp, provider, model, connection_id, endpoint, status,
      latency_ttft_ms, latency_total_ms, prompt_tokens, completion_tokens,
      has_request_payload, has_response_payload,
      request_payload_path, provider_request_payload_path, provider_response_payload_path, response_payload_path,
      error_summary, payload_truncated, created_at,
      correlation_id, trace_mode, trace_event_count, trace_last_event_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    detail.id,
    detail.timestamp,
    detail.provider || null,
    detail.model || null,
    detail.connectionId || null,
    detail.endpoint || null,
    detail.status || null,
    indexedLatency.ttft,
    indexedLatency.total,
    indexedTokens.usagePresent ? indexedTokens.promptTokens : 0,
    indexedTokens.usagePresent ? indexedTokens.completionTokens : 0,
    1,
    1,
    payloadResult.paths.request,
    payloadResult.paths.providerRequest,
    payloadResult.paths.providerResponse,
    payloadResult.paths.response,
    detail.response?.error || detail.providerResponse?.error || null,
    payloadResult.truncated ? 1 : 0,
    new Date().toISOString(),
    correlationId,
    trace?.mode || null,
    traceEventCount,
    traceLastEventType,
  );
}

async function applyRetentionCleanup() {
  const countRow = prepareRequestDetailsStatement(`SELECT COUNT(*) as c FROM request_details_index`).get() as any;
  if ((countRow?.c || 0) <= MAX_REQUEST_DETAIL_RECORDS) return;

  const rows = prepareRequestDetailsStatement(`
    SELECT id, request_payload_path, provider_request_payload_path, provider_response_payload_path, response_payload_path
    FROM request_details_index
    ORDER BY timestamp DESC
  `).all();

  if (rows.length <= MAX_REQUEST_DETAIL_RECORDS) {
    return;
  }

  const staleRows = rows.slice(MAX_REQUEST_DETAIL_RECORDS);
  const deleteStmt = prepareRequestDetailsStatement(`DELETE FROM request_details_index WHERE id = ?`);

  for (const row of staleRows) {
    deleteStmt.run(row.id);
    await deleteRequestDetailPayloadFiles({
      request: row.request_payload_path,
      providerRequest: row.provider_request_payload_path,
      providerResponse: row.provider_response_payload_path,
      response: row.response_payload_path,
    });
  }
}

export async function flushRequestDetailBatch(batch) {
  let written = 0;
  for (const detail of batch) {
    try {
      const payloadResult = await writeRequestDetailPayloadFiles(detail);
      upsertRequestDetailIndex(detail, payloadResult);
      written += 1;
    } catch (err) {
      console.error(`[requestDetailsDb] Failed to write detail ${detail?.id}:`, (err as Error)?.message || err);
    }
  }

  await applyRetentionCleanup();
  return { written };
}

export async function hydrateRequestDetailRecord(row) {
  if (!row) return null;
  const request = row.request_payload_path ? await readRequestDetailPayloadFile(row.request_payload_path) : null;
  const providerRequest = row.provider_request_payload_path ? await readRequestDetailPayloadFile(row.provider_request_payload_path) : null;
  const providerResponse = row.provider_response_payload_path ? await readRequestDetailPayloadFile(row.provider_response_payload_path) : null;
  const response = row.response_payload_path ? await readRequestDetailPayloadFile(row.response_payload_path) : null;
  const trace = findTrace({ request, providerResponse, response });
  const correlationId = row.correlation_id || findCorrelationId({ request, providerResponse, response }, trace);
  const usageFallback = buildIndexedTokens(providerResponse?.usage || response?.usage || null);
  const promptTokens = row.prompt_tokens === null || row.prompt_tokens === undefined
    ? (usageFallback.usagePresent ? usageFallback.promptTokens : null)
    : Number(row.prompt_tokens);
  const completionTokens = row.completion_tokens === null || row.completion_tokens === undefined
    ? (usageFallback.usagePresent ? usageFallback.completionTokens : null)
    : Number(row.completion_tokens);

  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    connectionId: row.connection_id,
    timestamp: row.timestamp,
    status: row.status,
    latency: buildHydratedLatency(row),
    tokens: {
      ...(promptTokens !== null && promptTokens !== undefined ? { prompt_tokens: promptTokens } : {}),
      ...(completionTokens !== null && completionTokens !== undefined ? { completion_tokens: completionTokens } : {}),
    },
    correlationId,
    traceSummary: buildTraceSummary(trace, row),
    request,
    providerRequest,
    providerResponse,
    response,
  };
}

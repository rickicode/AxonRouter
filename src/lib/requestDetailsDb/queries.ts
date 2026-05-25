import { prepareRequestDetailsStatement } from "./core";
import { hydrateRequestDetailRecord } from "./writer";

export function getKnownProvidersFromDb() {
  const rows = prepareRequestDetailsStatement(`
    SELECT DISTINCT provider FROM request_details_index WHERE provider IS NOT NULL AND provider != '' ORDER BY provider ASC
  `).all();
  return rows.map((row) => row.provider);
}

type RequestDetailsIndexFilter = {
  provider?: string;
  model?: string;
  connectionId?: string;
  status?: string;
  correlationId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

export async function getRequestDetailsIndex(filter: RequestDetailsIndexFilter = {}) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filter.provider) {
    clauses.push("provider = ?");
    params.push(filter.provider);
  }
  if (filter.model) {
    clauses.push("model = ?");
    params.push(filter.model);
  }
  if (filter.connectionId) {
    clauses.push("connection_id = ?");
    params.push(filter.connectionId);
  }
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.correlationId) {
    clauses.push("correlation_id = ?");
    params.push(filter.correlationId);
  }
  if (filter.startDate) {
    clauses.push("timestamp >= ?");
    params.push(new Date(filter.startDate).toISOString());
  }
  if (filter.endDate) {
    clauses.push("timestamp <= ?");
    params.push(new Date(filter.endDate).toISOString());
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const countRow = prepareRequestDetailsStatement(`
    SELECT COUNT(*) AS totalItems
    FROM request_details_index
    ${whereClause}
  `).get(...params);

  const totalItems = Number(countRow?.totalItems || 0);
  const page = filter.page || 1;
  const pageSize = filter.pageSize || 50;
  const totalPages = Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;

  const pageRows = prepareRequestDetailsStatement(`
    SELECT *
    FROM request_details_index
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  const details = pageRows.map((r: any) => ({
    id: r.id,
    provider: r.provider,
    model: r.model,
    connectionId: r.connection_id,
    timestamp: r.timestamp,
    status: r.status,
    correlationId: r.correlation_id || null,
    latency: {
      ...(r.latency_ttft_ms === null || r.latency_ttft_ms === undefined ? {} : { ttft: Number(r.latency_ttft_ms) }),
      ...(r.latency_total_ms === null || r.latency_total_ms === undefined ? {} : { total: Number(r.latency_total_ms) }),
    },
    tokens: {
      ...(r.prompt_tokens === null || r.prompt_tokens === undefined ? {} : { prompt_tokens: Number(r.prompt_tokens) }),
      ...(r.completion_tokens === null || r.completion_tokens === undefined ? {} : { completion_tokens: Number(r.completion_tokens) }),
    },
    traceSummary: r.trace_mode || r.trace_last_event_type || Number(r.trace_event_count || 0) > 0
      ? {
          mode: r.trace_mode || null,
          lastEventType: r.trace_last_event_type || null,
          eventCount: Number(r.trace_event_count || 0),
        }
      : null,
    request: null,
    providerRequest: null,
    providerResponse: null,
    response: null,
  }));

  return {
    details,
    pagination: { page, pageSize, totalItems, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

export async function getRequestDetailByIdFromDb(id) {
  const row = prepareRequestDetailsStatement(`SELECT * FROM request_details_index WHERE id = ?`).get(id);
  return hydrateRequestDetailRecord(row);
}

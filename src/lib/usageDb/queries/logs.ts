import { prepareUsageStatement } from "../core";

function mapLogRow(row: any) {
  return {
    id: Number(row.id),
    timestamp: row.timestamp,
    requestId: row.request_id || null,
    provider: row.provider || null,
    model: row.model || null,
    connectionId: row.connection_id || null,
    status: row.status,
    promptTokens: row.prompt_tokens === null || row.prompt_tokens === undefined ? null : Number(row.prompt_tokens),
    completionTokens: row.completion_tokens === null || row.completion_tokens === undefined ? null : Number(row.completion_tokens),
    source: row.source || "general",
    metadata: (() => { if (!row.metadata_json) return null; try { return JSON.parse(row.metadata_json); } catch { return null; } })(),
  };
}

export function getRecentUsageLogRows(limit = 200, { source = null }: any = {}) {
  const sql = source
    ? `SELECT * FROM usage_request_logs WHERE source = ? ORDER BY timestamp DESC LIMIT ?`
    : `SELECT * FROM usage_request_logs ORDER BY timestamp DESC LIMIT ?`;
  const rows: any[] = source
    ? (prepareUsageStatement(sql).all(source, limit) as any[])
    : (prepareUsageStatement(sql).all(limit) as any[]);
  return rows.map(mapLogRow);
}

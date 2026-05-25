import { prepareUsageStatement } from "../core";

function mapRecentRow(row) {
  return {
    timestamp: row.timestamp,
    model: row.model || "unknown",
    provider: row.provider || "unknown",
    promptTokens: Number(row.tokens_input || 0),
    completionTokens: Number(row.tokens_output || 0),
    status: row.status || "ok",
    endpoint: row.endpoint || "Unknown",
  };
}

export function getRecentUsageRowsFromDb(limit = 20, { source = null } = {}) {
  const sql = source
    ? `SELECT timestamp, model, provider, tokens_input, tokens_output, status, endpoint
       FROM usage_events
       WHERE source = ? AND (tokens_input > 0 OR tokens_output > 0)
       ORDER BY timestamp DESC
       LIMIT ?`
    : `SELECT timestamp, model, provider, tokens_input, tokens_output, status, endpoint
       FROM usage_events
       WHERE tokens_input > 0 OR tokens_output > 0
       ORDER BY timestamp DESC
       LIMIT ?`;
  const rawRows = source
    ? prepareUsageStatement(sql).all(source, limit)
    : prepareUsageStatement(sql).all(limit);
  const rows = Array.isArray(rawRows) ? rawRows : [];

  const seen = new Set();
  return rows
    .map(mapRecentRow)
    .filter((row) => {
      const minute = row.timestamp ? row.timestamp.slice(0, 16) : "";
      const key = `${row.model}|${row.provider}|${row.promptTokens}|${row.completionTokens}|${minute}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

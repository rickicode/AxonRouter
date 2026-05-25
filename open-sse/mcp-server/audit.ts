import crypto from "node:crypto";
import { initAuditDb } from "./auditRuntime";

function hashInput(input) {
  return crypto.createHash("sha256").update(JSON.stringify(input || {})).digest("hex");
}

function summarizeOutput(output) {
  const raw = typeof output === "string" ? output : JSON.stringify(output || {});
  return raw.length > 200 ? `${raw.slice(0, 197)}...` : raw;
}

export async function logToolCall(toolName: any, input: any, output: any, durationMs: any, success: any, errorCode: any = null, meta: any = {}) {
  const db = await initAuditDb();
  db.prepare(`
    INSERT INTO mcp_tool_audit (tool_name, input_hash, output_summary, duration_ms, api_key_id, transport, success, error_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    toolName,
    hashInput(input),
    summarizeOutput(output),
    Number(durationMs || 0),
    meta.apiKeyId || null,
    meta.transport || null,
    success ? 1 : 0,
    errorCode,
    new Date().toISOString(),
  );
}

export async function queryAuditEntries({ limit = 50, offset = 0, tool, success, apiKeyId }: any = {}) {
  const db = await initAuditDb();
  const clauses = [];
  const params = [];
  if (tool) {
    clauses.push("tool_name = ?");
    params.push(tool);
  }
  if (typeof success === "boolean") {
    clauses.push("success = ?");
    params.push(success ? 1 : 0);
  }
  if (apiKeyId) {
    clauses.push("api_key_id = ?");
    params.push(apiKeyId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) AS total FROM mcp_tool_audit ${where}`).get(...params)?.total || 0;
  const entries = db.prepare(`SELECT * FROM mcp_tool_audit ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { entries, total, limit, offset };
}

export async function getAuditStats() {
  const db = await initAuditDb();
  const summary = db.prepare(`
    SELECT COUNT(*) AS totalCalls,
           COALESCE(AVG(duration_ms), 0) AS avgDurationMs,
           COALESCE(AVG(CASE WHEN success = 1 THEN 100.0 ELSE 0 END), 0) AS successRate
    FROM mcp_tool_audit
    WHERE created_at >= datetime('now', '-1 day')
  `).get() || {};
  const topTools = db.prepare(`
    SELECT tool_name AS tool, COUNT(*) AS count
    FROM mcp_tool_audit
    WHERE created_at >= datetime('now', '-1 day')
    GROUP BY tool_name
    ORDER BY count DESC
    LIMIT 5
  `).all();
  return {
    totalCalls: Number(summary.totalCalls || 0),
    avgDurationMs: Number(summary.avgDurationMs || 0),
    successRate: Number(summary.successRate || 0),
    topTools,
  };
}

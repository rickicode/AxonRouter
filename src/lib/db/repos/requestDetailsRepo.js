import { randomUUID } from "node:crypto";
import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";

const DEFAULT_MAX_RECORDS = 200;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_JSON_SIZE = 5 * 1024;
const MAX_BUFFER_SIZE = 5000;
const CONFIG_CACHE_TTL_MS = 5000;

let cachedConfig = null;
let cachedConfigTs = 0;
let writeBuffer = [];
let flushTimer = null;
let isFlushing = false;

function normalizeJson(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  return typeof value === "string" ? parseJson(value, fallback) : value;
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const sensitiveKeys = ["authorization", "x-api-key", "cookie", "token", "api-key"];
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !sensitiveKeys.some((s) => key.toLowerCase().includes(s))),
  );
}

export const __test__ = { sanitizeHeaders };

function truncateField(value, maxSize) {
  if (value === undefined || value === null) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxSize) return value;
  return {
    _truncated: true,
    _originalSize: serialized.length,
    _preview: serialized.slice(0, 200),
  };
}

function generateDetailId(model) {
  const modelPart = model ? String(model).replace(/[^a-zA-Z0-9-]/g, "-") : "unknown";
  return `${new Date().toISOString()}-${randomUUID()}-${modelPart}`;
}

function rowToDetail(row) {
  if (!row) return null;
  return normalizeJson(row.data, {});
}

async function getObservabilityConfig() {
  if (cachedConfig && Date.now() - cachedConfigTs < CONFIG_CACHE_TTL_MS) return cachedConfig;

  try {
    const { getSettings } = await import("./settingsRepo.js");
    const settings = await getSettings();
    const envRequestLogs = process.env.ENABLE_REQUEST_LOGS;
    const enabled = envRequestLogs !== undefined
      ? envRequestLogs.toLowerCase() === "true"
      : settings.enableObservability !== false && process.env.OBSERVABILITY_ENABLED !== "false";
    cachedConfig = {
      enabled,
      maxRecords: Number(settings.observabilityMaxRecords || process.env.OBSERVABILITY_MAX_RECORDS || DEFAULT_MAX_RECORDS),
      batchSize: Number(settings.observabilityBatchSize || process.env.OBSERVABILITY_BATCH_SIZE || DEFAULT_BATCH_SIZE),
      flushIntervalMs: Number(settings.observabilityFlushIntervalMs || process.env.OBSERVABILITY_FLUSH_INTERVAL_MS || DEFAULT_FLUSH_INTERVAL_MS),
      maxJsonSize: Number(settings.observabilityMaxJsonSize || process.env.OBSERVABILITY_MAX_JSON_SIZE || 5) * 1024,
    };
  } catch {
    cachedConfig = {
      enabled: false,
      maxRecords: DEFAULT_MAX_RECORDS,
      batchSize: DEFAULT_BATCH_SIZE,
      flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
      maxJsonSize: DEFAULT_MAX_JSON_SIZE,
    };
  }
  cachedConfigTs = Date.now();
  return cachedConfig;
}

async function flushToDatabase() {
  if (isFlushing || writeBuffer.length === 0) return;
  isFlushing = true;
  // Declared outside the loop: the catch handler below must be able to
  // requeue the in-flight batch. Referencing the loop-scoped `items` here
  // used to throw ReferenceError, masking the real DB error and dropping data.
  let failedItems = [];
  try {
    while (writeBuffer.length > 0) {
      const items = writeBuffer.splice(0, writeBuffer.length);
      failedItems = items;
      const db = await getAdapter();
      const config = await getObservabilityConfig();

      await db.transaction(async (tx) => {
        for (const item of items) {
          const detail = { ...item };
          detail.id ||= generateDetailId(detail.model);
          detail.timestamp ||= new Date().toISOString();
          if (detail.request?.headers) {
            detail.request = { ...detail.request, headers: sanitizeHeaders(detail.request.headers) };
          }

          const record = {
            ...detail,
            provider: detail.provider || null,
            model: detail.model || null,
            connectionId: detail.connectionId || null,
            status: detail.status || null,
            latency: detail.latency || {},
            tokens: detail.tokens || {},
            request: truncateField(detail.request, config.maxJsonSize),
            providerRequest: truncateField(detail.providerRequest, config.maxJsonSize),
            providerResponse: truncateField(detail.providerResponse, config.maxJsonSize),
            response: truncateField(detail.response, config.maxJsonSize),
            pxpipe: detail.pxpipe,
          };

          await tx.run(
            `INSERT INTO request_details (id, timestamp, provider, model, connection_id, status, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
             ON CONFLICT (id, timestamp) DO UPDATE SET
               provider = EXCLUDED.provider,
               model = EXCLUDED.model,
               connection_id = EXCLUDED.connection_id,
               status = EXCLUDED.status,
               data = EXCLUDED.data`,
            [
              record.id,
              record.timestamp,
              record.provider,
              record.model,
              record.connectionId,
              record.status,
              record,
            ],
          );
        }

        // Fast partition-pruned cleanup: find timestamp cutoff instead of unindexed composite IN subquery
         const countRow = await tx.get(`SELECT COUNT(*) AS total FROM request_details`);
         const excess = Number(countRow?.total || 0) - config.maxRecords;
        if (excess > 0) {
          const cutoffRow = await tx.get(
             `SELECT timestamp, id FROM request_details ORDER BY timestamp ASC, id ASC OFFSET $1 LIMIT 1`,
            [excess],
          );
          if (cutoffRow?.timestamp) {
             await tx.run(`DELETE FROM request_details WHERE (timestamp, id) < ($1, $2)`, [cutoffRow.timestamp, cutoffRow.id]);
          }
        }
      });
    }
  } catch (error) {
    writeBuffer = [...failedItems, ...writeBuffer].slice(-MAX_BUFFER_SIZE);
    console.error("[requestDetailsRepo] Batch write failed:", error);
  } finally {
    isFlushing = false;
  }
}

export async function saveRequestDetail(detail) {
  const config = await getObservabilityConfig();
  if (!config.enabled || !detail || typeof detail !== "object") return;

  writeBuffer.push(detail);
  if (writeBuffer.length >= config.batchSize) {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    await flushToDatabase();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushToDatabase().catch((error) => console.error("[requestDetailsRepo] flush failed:", error));
    }, config.flushIntervalMs);
    flushTimer.unref?.();
  }
}

export async function getRequestDetails(filter = {}) {
  const db = await getAdapter();
  const conditions = [];
  const params = [];
  const add = (condition, value) => {
    params.push(value);
    conditions.push(condition.replace("?", `$${params.length}`));
  };

  if (filter.provider) add("provider = ?", filter.provider);
  if (filter.model) add("model = ?", filter.model);
  if (filter.connectionId) add("connection_id = ?", filter.connectionId);
  if (filter.status) {
    if (filter.status === "failed") {
      // All non-success: error, failed, or any non-success status
      conditions.push(`status != 'success'`);
    } else {
      add("status = ?", filter.status);
    }
  }
  if (filter.statusCode) {
    const code = String(filter.statusCode);
    params.push(code);
    const idx = params.length;
    // Match HTTP code in response/providerResponse/errorCode or status text
    conditions.push(`(data->'response'->>'status' = $${idx} OR data->'providerResponse'->>'status' = $${idx} OR data->>'errorCode' = $${idx} OR data->>'status' = $${idx} OR status = $${idx})`);
  }
  if (filter.startDate) add("timestamp >= ?", new Date(filter.startDate).toISOString());
  if (filter.endDate) add("timestamp <= ?", new Date(filter.endDate).toISOString());

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
   const count = await db.get(`SELECT COUNT(*) AS count FROM request_details ${where}`, params);
  const totalItems = count?.count || 0;
  const page = Math.max(1, Number(filter.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filter.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const rows = await db.all(
     `SELECT data FROM request_details ${where} ORDER BY timestamp DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset],
  );

  const totalPages = Math.ceil(totalItems / pageSize);
  return {
    details: rows.map(rowToDetail),
    pagination: { page, pageSize, totalItems, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

export async function getRequestDetailById(id) {
  if (!id) return null;
  const db = await getAdapter();
  const row = await db.get(
    `SELECT data FROM request_details WHERE id = $1 ORDER BY timestamp DESC LIMIT 1`,
    [id],
  );
  return rowToDetail(row);
}

export async function getDistinctProviders() {
  const db = await getAdapter();
  const rows = await db.all(
    `SELECT DISTINCT provider FROM request_details WHERE provider IS NOT NULL ORDER BY provider ASC`,
  );
  return rows.map((row) => row.provider);
}

export async function getFailureAnalytics({
  provider,
  model,
  timeFrom,
  timeTo,
  limit = 20,
} = {}) {
  try {
    const db = await getAdapter();
    const conditions = ["status != 'success'"];
    const params = [];
    const add = (condition, value) => {
      params.push(value);
      conditions.push(condition.replace("?", `$${params.length}`));
    };

    if (provider) add("provider = ?", provider);
    if (model) add("model = ?", model);
    if (timeFrom) add("timestamp >= ?", new Date(timeFrom).toISOString());
    if (timeTo) add("timestamp <= ?", new Date(timeTo).toISOString());

    const where = `WHERE ${conditions.join(" AND ")}`;

    const topModelsSql = `
      SELECT 
        provider,
        model,
        COUNT(*)::int AS failure_count,
        MAX(timestamp) AS latest_failed_at,
        (ARRAY_AGG(COALESCE(
          NULLIF(data->>'error', ''),
          NULLIF(data->'response'->>'error', ''),
          NULLIF(data->'response'->>'message', ''),
          NULLIF(data->'providerResponse'->>'error', ''),
          NULLIF(data->'response'->'error'->>'message', ''),
          status,
          'Unknown failure'
        ) ORDER BY timestamp DESC))[1] AS sample_error,
        (ARRAY_AGG(COALESCE(
          NULLIF(data->'response'->>'status', ''),
          NULLIF(data->'providerResponse'->>'status', ''),
          NULLIF(data->>'errorCode', ''),
          NULLIF(data->>'status', ''),
          status,
          '500'
        ) ORDER BY timestamp DESC))[1] AS sample_status_code
      FROM request_details
      ${where}
      GROUP BY provider, model
      ORDER BY failure_count DESC
      LIMIT 25;
    `;

    const topProvidersSql = `
      SELECT 
        provider,
        COUNT(*)::int AS failure_count,
        MAX(timestamp) AS latest_failed_at,
        (ARRAY_AGG(COALESCE(
          NULLIF(data->>'error', ''),
          NULLIF(data->'response'->>'error', ''),
          NULLIF(data->'response'->>'message', ''),
          NULLIF(data->'providerResponse'->>'error', ''),
          NULLIF(data->'response'->'error'->>'message', ''),
          status,
          'Unknown failure'
        ) ORDER BY timestamp DESC))[1] AS sample_error,
        (ARRAY_AGG(COALESCE(
          NULLIF(data->'response'->>'status', ''),
          NULLIF(data->'providerResponse'->>'status', ''),
          NULLIF(data->>'errorCode', ''),
          NULLIF(data->>'status', ''),
          status,
          '500'
        ) ORDER BY timestamp DESC))[1] AS sample_status_code
      FROM request_details
      ${where}
      GROUP BY provider
      ORDER BY failure_count DESC
      LIMIT 25;
    `;

    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const recentSql = `
      SELECT data
      FROM request_details
      ${where}
      ORDER BY timestamp DESC, id DESC
      LIMIT $${params.length + 1};
    `;

    const [topModels, topProviders, recentRows] = await Promise.all([
      db.all(topModelsSql, params).catch(() => []),
      db.all(topProvidersSql, params).catch(() => []),
      db.all(recentSql, [...params, safeLimit]).catch(() => []),
    ]);

    return {
      topModels: (topModels || []).map((row) => ({
        provider: row.provider,
        model: row.model,
        failureCount: Number(row.failure_count || 0),
        latestFailedAt: row.latest_failed_at,
        sampleError: row.sample_error,
        sampleStatusCode: row.sample_status_code,
      })),
      topProviders: (topProviders || []).map((row) => ({
        provider: row.provider,
        failureCount: Number(row.failure_count || 0),
        latestFailedAt: row.latest_failed_at,
        sampleError: row.sample_error,
        sampleStatusCode: row.sample_status_code,
      })),
      recentFailures: (recentRows || []).map(rowToDetail).filter(Boolean),
    };
  } catch (err) {
    console.error("[requestDetailsRepo] getFailureAnalytics error:", err);
    return { topModels: [], topProviders: [], recentFailures: [] };
  }
}

// Combo analytics: aggregate per combo (comboName in data) and per member
// (provider+model) over the window — success/error counts, avg latency,
// top error samples. Members are keyed "model|provider"; comboName is null
// for solo (non-combo) requests, so filter it explicitly.
export async function getComboAnalytics({ timeFrom, timeTo } = {}) {
  try {
    const db = await getAdapter();
    const conditions = ["data->>'comboName' IS NOT NULL", "data->>'comboName' != ''"];
    const params = [];
    const add = (condition, value) => {
      params.push(value);
      conditions.push(condition.replace("?", `$${params.length}`));
    };
    if (timeFrom) add("timestamp >= ?", new Date(timeFrom).toISOString());
    if (timeTo) add("timestamp <= ?", new Date(timeTo).toISOString());

    const where = `WHERE ${conditions.join(" AND ")}`;

    const comboSql = `
      SELECT
        data->>'comboName' AS combo_name,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success,
        COUNT(*) FILTER (WHERE status != 'success')::int AS errors,
        COALESCE(ROUND(AVG(COALESCE((data->'latency'->>'total')::numeric, 0)) / 1000.0, 2), 0) AS avg_latency_s,
        MAX(timestamp) AS last_seen
      FROM request_details
      ${where}
      GROUP BY 1
      ORDER BY errors DESC, total DESC;
    `;

    const memberSql = `
      SELECT
        data->>'comboName' AS combo_name,
        model,
        provider,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success,
        COUNT(*) FILTER (WHERE status != 'success')::int AS errors,
        COALESCE(ROUND(AVG(CASE WHEN status = 'success' THEN COALESCE((data->'latency'->>'total')::numeric, 0) END) / 1000.0, 2), 0) AS avg_latency_s,
        MAX(timestamp) AS last_seen,
        (ARRAY_AGG(COALESCE(
          NULLIF(data->>'error', ''),
          NULLIF(data->'response'->>'error', ''),
          NULLIF(data->'response'->>'message', ''),
          NULLIF(data->'providerResponse'->>'error', ''),
          status,
          'Unknown failure'
        ) ORDER BY timestamp DESC))[1] AS sample_error,
        (ARRAY_AGG(COALESCE(
          NULLIF(data->'response'->>'status', ''),
          NULLIF(data->'providerResponse'->>'status', ''),
          NULLIF(data->>'errorCode', ''),
          status,
          ''
        ) ORDER BY timestamp DESC))[1] AS sample_status
      FROM request_details
      ${where}
      GROUP BY 1, 2, 3
      ORDER BY combo_name ASC, errors DESC, total DESC;
    `;

    const difficultySql = `
      SELECT
        data->>'comboName' AS combo_name,
        COALESCE(data->'difficulty'->>'tier', 'unknown') AS tier,
        NULLIF(data->'difficulty'->>'domain', '') AS domain,
        NULLIF(data->'difficulty'->>'policy', '') AS policy,
        ROUND(AVG(COALESCE((data->'difficulty'->>'confidence')::numeric, 1.0)), 2) AS avg_confidence,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success,
        COUNT(*) FILTER (WHERE (data->'difficulty'->>'judgeUsed')::boolean IS TRUE)::int AS judge_used,
        COUNT(*) FILTER (WHERE (data->'difficulty'->>'source') = 'judge')::int AS judged,
        MAX(timestamp) AS last_seen
      FROM request_details
      ${where} AND data->'difficulty' IS NOT NULL
      GROUP BY 1, 2, 3, 4
      ORDER BY combo_name ASC, total DESC;
    `;
    const difficultyModelSql = `
      SELECT
        data->>'comboName' AS combo_name,
        COALESCE(data->'difficulty'->>'tier', 'unknown') AS tier,
        COALESCE(NULLIF(data->'difficulty'->>'winningModel', ''), model) AS model,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success,
        COUNT(*) FILTER (WHERE status != 'success')::int AS errors,
        MAX(timestamp) AS last_seen
      FROM request_details
      ${where} AND data->'difficulty' IS NOT NULL
      GROUP BY 1, 2, 3
      ORDER BY combo_name ASC, total DESC;
    `;

    const [comboRows, memberRows, difficultyRows, difficultyModelRows] = await Promise.all([
      db.all(comboSql, params).catch(() => []),
      db.all(memberSql, params).catch(() => []),
      db.all(difficultySql, params).catch(() => []),
      db.all(difficultyModelSql, params).catch(() => []),
    ]);

    return {
      combos: (comboRows || []).map((row) => ({
        comboName: row.combo_name,
        total: Number(row.total || 0),
        success: Number(row.success || 0),
        errors: Number(row.errors || 0),
        avgLatencyS: Number(row.avg_latency_s || 0),
        lastSeen: row.last_seen,
      })),
      members: (memberRows || []).map((row) => ({
        comboName: row.combo_name,
        model: row.model,
        provider: row.provider,
        total: Number(row.total || 0),
        success: Number(row.success || 0),
        errors: Number(row.errors || 0),
        avgLatencyS: Number(row.avg_latency_s || 0),
        lastSeen: row.last_seen,
        sampleError: row.sample_error,
        sampleStatus: row.sample_status,
      })),
      difficulty: (difficultyRows || []).map((row) => ({
        comboName: row.combo_name,
        tier: row.tier,
        domain: row.domain || null,
        policy: row.policy || null,
        avgConfidence: row.avg_confidence != null ? Number(row.avg_confidence) : null,
        total: Number(row.total || 0),
        success: Number(row.success || 0),
        judgeUsed: Number(row.judge_used || 0),
        judged: Number(row.judged || 0),
        lastSeen: row.last_seen,
      })),
      difficultyModels: (difficultyModelRows || []).map((row) => ({
        comboName: row.combo_name,
        tier: row.tier,
        model: row.model,
        total: Number(row.total || 0),
        success: Number(row.success || 0),
        errors: Number(row.errors || 0),
        lastSeen: row.last_seen,
      })),
    };
  } catch (err) {
    console.error("[requestDetailsRepo] getComboAnalytics error:", err);
    return { combos: [], members: [], difficulty: [], difficultyModels: [] };
  }
}

async function flushOnShutdown() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  await flushToDatabase();
}

process.once("beforeExit", flushOnShutdown);
process.once("SIGINT", () => { flushOnShutdown().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { flushOnShutdown().finally(() => process.exit(0)); });

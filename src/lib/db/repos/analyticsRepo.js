import { randomUUID } from "node:crypto";
import { getAdapter } from "../driver.js";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL_MS = 500;
const MAX_BUFFER_SIZE = 5000;
const MIN_SAMPLE_RECOMMENDATION_THRESHOLD = 30;

const ALLOWED_ERROR_CATEGORIES = new Set([
  "upstream",
  "rate_limit",
  "auth",
  "timeout",
  "cancelled",
  "stream",
  "internal",
  "unknown",
]);

let writeBuffer = [];
let flushTimer = null;
let isFlushing = false;

export function categorizeError(error, status) {
  const statusCode = Number(status);
  if (statusCode === 401 || statusCode === 403) return "auth";
  if (statusCode === 429) return "rate_limit";
  if (statusCode === 408 || statusCode === 504) return "timeout";
  if (statusCode >= 500) return "upstream";

  const msg = String(error?.message || error || "").toLowerCase();
  if (msg.includes("abort") || msg.includes("cancel")) return "cancelled";
  if (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("deadline")
  )
    return "timeout";
  if (
    msg.includes("stream") ||
    msg.includes("transform") ||
    msg.includes("pipe")
  )
    return "stream";
  if (
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("key")
  )
    return "auth";
  if (
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("429")
  )
    return "rate_limit";
  if (
    msg.includes("upstream") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503")
  )
    return "upstream";

  return "unknown";
}

export function sanitizeAnalyticsEvent(raw) {
  if (!raw || typeof raw !== "object") return null;

  const provider = typeof raw.provider === "string" ? raw.provider.trim() : "";
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  if (!provider || !model) return null;

  const success = Boolean(raw.success);
  let latencyMs = null;
  if (
    typeof raw.latency_ms === "number" &&
    Number.isFinite(raw.latency_ms) &&
    raw.latency_ms >= 0
  ) {
    latencyMs = raw.latency_ms;
  } else if (
    typeof raw.latencyMs === "number" &&
    Number.isFinite(raw.latencyMs) &&
    raw.latencyMs >= 0
  ) {
    latencyMs = raw.latencyMs;
  }

  let inputTokens = null;
  const inTok = raw.input_tokens ?? raw.prompt_tokens ?? raw.inputTokens;
  if (typeof inTok === "number" && Number.isFinite(inTok) && inTok >= 0) {
    inputTokens = Math.floor(inTok);
  }

  let outputTokens = null;
  const outTok = raw.output_tokens ?? raw.completion_tokens ?? raw.outputTokens;
  if (typeof outTok === "number" && Number.isFinite(outTok) && outTok >= 0) {
    outputTokens = Math.floor(outTok);
  }

  let errorCategory = null;
  if (!success) {
    const rawCat = raw.error_category || raw.errorCategory;
    if (typeof rawCat === "string" && ALLOWED_ERROR_CATEGORIES.has(rawCat)) {
      errorCategory = rawCat;
    } else {
      errorCategory = categorizeError(raw.error, raw.status);
    }
  }

  let timestamp = new Date();
  if (raw.timestamp) {
    const parsed = new Date(raw.timestamp);
    if (!Number.isNaN(parsed.getTime())) timestamp = parsed;
  }

  return {
    id:
      raw.id && typeof raw.id === "string" && raw.id.length >= 32
        ? raw.id
        : randomUUID(),
    timestamp: timestamp.toISOString(),
    provider,
    model,
    success,
    latency_ms: latencyMs,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    error_category: errorCategory,
  };
}

export async function flushAnalyticsEvents() {
  if (isFlushing || writeBuffer.length === 0) return;
  isFlushing = true;
  let failedItems = [];
  try {
    while (writeBuffer.length > 0) {
      const items = writeBuffer.splice(0, DEFAULT_BATCH_SIZE);
      failedItems = items;
      const db = await getAdapter();

      await db.transaction(async (tx) => {
        for (const item of items) {
          await tx.run(
            `INSERT INTO analytics_events (
              id, timestamp, provider, model, success,
              latency_ms, input_tokens, output_tokens, error_category
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO NOTHING;`,
            [
              item.id,
              item.timestamp,
              item.provider,
              item.model,
              item.success,
              item.latency_ms,
              item.input_tokens,
              item.output_tokens,
              item.error_category,
            ],
          );
        }
      });
      failedItems = [];
    }
  } catch (err) {
    writeBuffer = [...failedItems, ...writeBuffer].slice(-MAX_BUFFER_SIZE);
    console.error("[AnalyticsRepo] flush error:", err.message);
  } finally {
    isFlushing = false;
  }
}

export function scheduleAnalyticsFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushAnalyticsEvents().catch(() => {});
  }, DEFAULT_FLUSH_INTERVAL_MS);
  flushTimer?.unref?.();
}

export function recordAnalyticsEvent(rawEvent) {
  const event = sanitizeAnalyticsEvent(rawEvent);
  if (!event) return false;

  if (writeBuffer.length >= MAX_BUFFER_SIZE) {
    writeBuffer.shift();
  }
  writeBuffer.push(event);

  if (writeBuffer.length >= DEFAULT_BATCH_SIZE) {
    flushAnalyticsEvents().catch(() => {});
  } else {
    scheduleAnalyticsFlush();
  }
  return true;
}

export async function getAnalyticsSummary({
  timeFrom,
  timeTo,
  provider,
  model,
  errorCategory,
  timeBucket = "1 hour",
} = {}) {
  const db = await getAdapter();
  const whereClauses = [];
  const params = [];

  if (timeFrom) {
    params.push(timeFrom);
    whereClauses.push(`timestamp >= $${params.length}`);
  }
  if (timeTo) {
    params.push(timeTo);
    whereClauses.push(`timestamp <= $${params.length}`);
  }
  if (provider) {
    params.push(provider);
    whereClauses.push(`provider = $${params.length}`);
  }
  if (model) {
    params.push(model);
    whereClauses.push(`model = $${params.length}`);
  }
  if (errorCategory) {
    params.push(errorCategory);
    whereClauses.push(`error_category = $${params.length}`);
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const overallSql = `
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(*) FILTER (WHERE success = true)::int AS success_count,
      COUNT(*) FILTER (WHERE success = false)::int AS failure_count,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE success = true) AS p50_latency_ms,
      COUNT(latency_ms) FILTER (WHERE success = true)::int AS latency_samples,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE success = true) AS p95_latency_ms,
      SUM(input_tokens)::bigint AS total_input_tokens,
      SUM(output_tokens)::bigint AS total_output_tokens
    FROM analytics_events
    ${whereSql};
  `;

  const perModelSql = `
    SELECT
      provider,
      model,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE success = true)::int AS success_count,
      COUNT(*) FILTER (WHERE success = false)::int AS failure_count,
      CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE success = true)::numeric / COUNT(*)::numeric) * 100, 2) ELSE 0 END AS success_rate,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE success = true) AS p50_latency_ms,
      COUNT(latency_ms) FILTER (WHERE success = true)::int AS latency_samples,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE success = true) AS p95_latency_ms,
      SUM(input_tokens)::bigint AS total_input_tokens,
      SUM(output_tokens)::bigint AS total_output_tokens,
      (COUNT(*) >= ${MIN_SAMPLE_RECOMMENDATION_THRESHOLD}) AS recommendation_eligible
    FROM analytics_events
    ${whereSql}
    GROUP BY provider, model
    ORDER BY count DESC;
  `;

  const errorDistSql = `
    SELECT
      error_category,
      COUNT(*)::int AS count
    FROM analytics_events
    ${whereSql ? `${whereSql} AND success = false` : "WHERE success = false"}
    GROUP BY error_category
    ORDER BY count DESC;
  `;

  const validBuckets = {
    "1 minute": "1 minute",
    "5 minutes": "5 minutes",
    "1 hour": "1 hour",
    "1 day": "1 day",
  };
  const safeBucket = validBuckets[timeBucket] || "1 hour";

  const timelineSql = `
    SELECT
      DATE_BIN(INTERVAL '${safeBucket}', timestamp, TIMESTAMPTZ '2000-01-01 00:00:00Z') AS bucket,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE success = true)::int AS success_count,
      COUNT(*) FILTER (WHERE success = false)::int AS failure_count,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE success = true) AS p50_latency_ms,
      COUNT(latency_ms) FILTER (WHERE success = true)::int AS latency_samples,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE success = true) AS p95_latency_ms,
      SUM(input_tokens)::bigint AS total_input_tokens,
      SUM(output_tokens)::bigint AS total_output_tokens
    FROM analytics_events
    ${whereSql}
    GROUP BY bucket
    ORDER BY bucket ASC;
  `;

  const byProviderSql = `
    SELECT
      provider,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE success = true)::int AS success_count,
      COUNT(*) FILTER (WHERE success = false)::int AS failure_count,
      CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE success = true)::numeric / COUNT(*)::numeric) * 100, 2) ELSE 0 END AS success_rate,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE success = true) AS p50_latency_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE success = true) AS p95_latency_ms,
      SUM(input_tokens)::bigint AS total_input_tokens,
      SUM(output_tokens)::bigint AS total_output_tokens
    FROM analytics_events
    ${whereSql}
    GROUP BY provider
    ORDER BY count DESC
    LIMIT 20;
  `;

  const byProviderErrorSql = `
    SELECT
      provider,
      error_category,
      COUNT(*)::int AS count
    FROM analytics_events
    ${whereSql ? `${whereSql} AND success = false` : "WHERE success = false"}
    GROUP BY provider, error_category
    ORDER BY provider, count DESC;
  `;

  const [overall, perModel, errorDistribution, timeline, byProvider, byProviderErrors] = await Promise.all([
    db.get(overallSql, params),
    db.all(perModelSql, params),
    db.all(errorDistSql, params),
    db.all(timelineSql, params),
    db.all(byProviderSql, params),
    db.all(byProviderErrorSql, params),
  ]);

  const total = overall?.total_events || 0;

  // Merge error breakdown per provider
  const providerErrorMap = {};
  for (const row of (byProviderErrors || [])) {
    if (!providerErrorMap[row.provider]) providerErrorMap[row.provider] = {};
    providerErrorMap[row.provider][row.error_category] = Number(row.count);
  }
  const byProviderMapped = (byProvider || []).map((row) => ({
    provider: row.provider,
    count: Number(row.count),
    successCount: Number(row.success_count),
    failureCount: Number(row.failure_count),
    successRate: Number(row.success_rate),
    p50LatencyMs: row.p50_latency_ms !== null ? Number(Number(row.p50_latency_ms).toFixed(0)) : null,
    p95LatencyMs: row.p95_latency_ms !== null ? Number(Number(row.p95_latency_ms).toFixed(0)) : null,
    totalInputTokens: Number(row.total_input_tokens || 0),
    totalOutputTokens: Number(row.total_output_tokens || 0),
    errorBreakdown: providerErrorMap[row.provider] || {},
  }));

  return {
    meta: {
      timeFrom: timeFrom || null,
      timeTo: timeTo || null,
      provider: provider || null,
      model: model || null,
      errorCategory: errorCategory || null,
      timeBucket: safeBucket,
      minSampleThreshold: MIN_SAMPLE_RECOMMENDATION_THRESHOLD,
    },
    summary: {
      totalEvents: total,
      successCount: overall?.success_count || 0,
      failureCount: overall?.failure_count || 0,
      successRate:
        total > 0
          ? Number(((overall.success_count / total) * 100).toFixed(2))
          : 0,
      p50LatencyMs:
        overall?.p50_latency_ms !== null
          ? Number(Number(overall?.p50_latency_ms).toFixed(2))
          : null,
      p95LatencyMs:
        overall?.p95_latency_ms !== null
          ? Number(Number(overall?.p95_latency_ms).toFixed(2))
          : null,
      totalInputTokens: Number(overall?.total_input_tokens || 0),
      totalOutputTokens: Number(overall?.total_output_tokens || 0),
      recommendationEligible: total >= MIN_SAMPLE_RECOMMENDATION_THRESHOLD,
    },
    byModel: perModel || [],
    byProvider: byProviderMapped,
    errorDistribution: errorDistribution || [],
    timeline: timeline || [],
  };
}

export async function pruneAnalyticsEvents({
  retentionDays = 30,
  maxRecords = 200000,
} = {}) {
  try {
    const db = await getAdapter();
    const days = Math.max(1, Math.min(365, Number(retentionDays) || 30));

    // 1. Time-based retention cutoff
    const timeResult = await db.run(
      `DELETE FROM analytics_events WHERE timestamp < NOW() - ($1 || ' days')::INTERVAL;`,
      [days],
    );

    // 2. Capacity-based cutoff if table exceeds maxRecords
    if (maxRecords && maxRecords > 0) {
      const countRow = await db.get(
         `SELECT COUNT(*) AS total FROM analytics_events;`,
      );
         const total = Number(countRow?.total || 0);
      if (total > maxRecords) {
        const excess = total - maxRecords;
        const cutoffRow = await db.get(
           `SELECT timestamp, id FROM analytics_events ORDER BY timestamp ASC, id ASC OFFSET $1 LIMIT 1;`,
          [excess],
        );
        if (cutoffRow?.timestamp) {
          await db.run(
             `DELETE FROM analytics_events WHERE (timestamp, id) < ($1, $2);`,
             [cutoffRow.timestamp, cutoffRow.id],
          );
        }
      }
    }
    return timeResult;
  } catch (err) {
    console.error("[AnalyticsRepo] prune error:", err.message);
    return null;
  }
}

export const __test__ = {
  getBuffer: () => writeBuffer,
  clearBuffer: () => {
    writeBuffer = [];
  },
  setBuffer: (items) => {
    writeBuffer = items;
  },
  ALLOWED_ERROR_CATEGORIES,
};

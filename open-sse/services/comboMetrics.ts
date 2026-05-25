/**
 * In-memory combo metrics tracker
 * Tracks per-combo, per-model, and per-target request counts, latency, success/failure rates.
 * Provides API for reading metrics from the dashboard.
 */

function toNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function inferProvider(modelStr) {
  const model = toNonEmptyString(modelStr);
  if (!model) return null;
  const [provider] = model.split("/");
  return toNonEmptyString(provider);
}

function createModelMetrics() {
  return {
    requests: 0,
    successes: 0,
    failures: 0,
    totalLatencyMs: 0,
    lastStatus: null,
    lastUsedAt: null,
  };
}

function createComboEntry(strategy) {
  return {
    totalRequests: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    totalFallbacks: 0,
    totalLatencyMs: 0,
    strategy,
    lastUsedAt: null,
    intentCounts: {},
    byModel: {},
    byTarget: {},
  };
}

function applyMetricOutcome(metric, success, latencyMs, usedAt) {
  metric.requests++;
  metric.totalLatencyMs += latencyMs;
  metric.lastUsedAt = usedAt;

  if (success) {
    metric.successes++;
    metric.lastStatus = "ok";
    return;
  }

  metric.failures++;
  metric.lastStatus = "error";
}

function buildTargetMetric(modelStr, target) {
  const executionKey = toNonEmptyString(target?.executionKey) || toNonEmptyString(modelStr);
  const model = toNonEmptyString(modelStr);
  if (!executionKey || !model) return null;

  return {
    executionKey,
    stepId: toNonEmptyString(target?.stepId),
    model,
    provider: toNonEmptyString(target?.provider) || inferProvider(model),
    providerId: toNonEmptyString(target?.providerId),
    connectionId:
      target?.connectionId === null ? null : (toNonEmptyString(target?.connectionId) ?? null),
    label: target?.label === null ? null : (toNonEmptyString(target?.label) ?? null),
    ...createModelMetrics(),
  };
}

function toMetricView(metric) {
  return {
    ...metric,
    avgLatencyMs: metric.requests > 0 ? Math.round(metric.totalLatencyMs / metric.requests) : 0,
    successRate: metric.requests > 0 ? Math.round((metric.successes / metric.requests) * 100) : 0,
  };
}

// In-memory store with capped size
const metrics = new Map();
const MAX_COMBO_METRICS_ENTRIES = 200;

function evictOldestMetrics() {
  if (metrics.size <= MAX_COMBO_METRICS_ENTRIES) return;
  // Evict entries with oldest lastUsedAt
  const entries = [...metrics.entries()].sort((a, b) => {
    const aTime = a[1].lastUsedAt || "";
    const bTime = b[1].lastUsedAt || "";
    return aTime.localeCompare(bTime);
  });
  const toRemove = entries.slice(0, metrics.size - MAX_COMBO_METRICS_ENTRIES);
  for (const [key] of toRemove) {
    metrics.delete(key);
  }
}

/**
 * Record a combo request result.
 * @param {string} comboName
 * @param {string} modelStr - The model that handled the request (or null if all failed)
 * @param {Object} options
 * @param {boolean} options.success
 * @param {number} options.latencyMs
 * @param {number} options.fallbackCount - How many fallbacks occurred
 * @param {string} [options.strategy] - Routing strategy name
 * @param {Object} [options.target] - Step/execution metadata for structured combos
 */
export function recordComboRequest(
  comboName,
  modelStr,
  {
    success,
    latencyMs,
    fallbackCount = 0,
    strategy = "priority",
    target,
  }
) {
  if (!metrics.has(comboName)) {
    const entry = createComboEntry(strategy);
    entry.lastUsedAt = new Date().toISOString();
    metrics.set(comboName, entry);
    evictOldestMetrics();
  }

  const combo = metrics.get(comboName);
  if (!combo) return;

  const usedAt = new Date().toISOString();
  combo.totalRequests++;
  combo.totalLatencyMs += latencyMs;
  combo.totalFallbacks += fallbackCount;
  combo.lastUsedAt = usedAt;
  combo.strategy = strategy;

  if (success) {
    combo.totalSuccesses++;
  } else {
    combo.totalFailures++;
  }

  if (!modelStr) return;

  if (!combo.byModel[modelStr]) {
    combo.byModel[modelStr] = createModelMetrics();
  }
  applyMetricOutcome(combo.byModel[modelStr], success, latencyMs, usedAt);

  const targetMetric = buildTargetMetric(modelStr, target || {});
  if (!targetMetric) return;

  if (!combo.byTarget[targetMetric.executionKey]) {
    combo.byTarget[targetMetric.executionKey] = targetMetric;
  }

  const existingTargetMetric = combo.byTarget[targetMetric.executionKey];
  existingTargetMetric.stepId = targetMetric.stepId || existingTargetMetric.stepId;
  existingTargetMetric.provider = targetMetric.provider || existingTargetMetric.provider;
  existingTargetMetric.providerId = targetMetric.providerId || existingTargetMetric.providerId;
  existingTargetMetric.connectionId =
    target?.connectionId === null
      ? null
      : (targetMetric.connectionId ?? existingTargetMetric.connectionId);
  existingTargetMetric.label =
    target?.label === null ? null : (targetMetric.label ?? existingTargetMetric.label);

  applyMetricOutcome(existingTargetMetric, success, latencyMs, usedAt);
}

/**
 * Get metrics for a specific combo.
 * @param {string} comboName
 * @returns {Object|null}
 */
export function getComboMetrics(comboName) {
  const combo = metrics.get(comboName);
  if (!combo) return null;

  return {
    ...combo,
    avgLatencyMs:
      combo.totalRequests > 0 ? Math.round(combo.totalLatencyMs / combo.totalRequests) : 0,
    successRate:
      combo.totalRequests > 0 ? Math.round((combo.totalSuccesses / combo.totalRequests) * 100) : 0,
    fallbackRate:
      combo.totalRequests > 0 ? Math.round((combo.totalFallbacks / combo.totalRequests) * 100) : 0,
    intentCounts: { ...combo.intentCounts },
    byModel: Object.fromEntries(
      Object.entries(combo.byModel).map(([model, metric]) => [model, toMetricView(metric)])
    ),
    byTarget: Object.fromEntries(
      Object.entries(combo.byTarget).map(([executionKey, metric]) => [
        executionKey,
        toMetricView(metric),
      ])
    ),
  };
}

/**
 * Get metrics for all combos.
 * @returns {Object} Map of comboName → metrics
 */
export function getAllComboMetrics() {
  const result = {};
  for (const [name] of metrics) {
    result[name] = getComboMetrics(name);
  }
  return result;
}

/**
 * Record detected prompt intent for a combo (used by multilingual routing analytics).
 */
export function recordComboIntent(comboName, intent) {
  if (!metrics.has(comboName)) {
    metrics.set(comboName, createComboEntry("priority"));
  }

  const combo = metrics.get(comboName);
  if (!combo) return;
  const key = String(intent || "unknown");
  combo.intentCounts[key] = (combo.intentCounts[key] || 0) + 1;
}

/**
 * Reset metrics for a specific combo.
 */
export function resetComboMetrics(comboName) {
  metrics.delete(comboName);
}

/**
 * Reset all combo metrics.
 */
export function resetAllComboMetrics() {
  metrics.clear();
}

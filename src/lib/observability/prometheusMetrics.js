// Prometheus metrics exporter for AxonRouter (zero-dependency).
// Emits standard Prometheus text exposition format (version 0.0.4)
// covering process resources, speed-layer cache, Postgres status, and routing counters.

import { memSize } from "@/lib/cache/memoryStore.js";
import { getRoutingMetrics } from "open-sse/services/routingMetrics.js";

/**
 * Format a Prometheus metric block with HELP and TYPE headers.
 * @param {string} name - Metric name
 * @param {string} help - Metric description
 * @param {string} type - "gauge" | "counter" | "histogram"
 * @param {number|string} value - Metric value
 * @param {Record<string, string>} [labels] - Optional key-value labels
 * @returns {string} Formatted metric lines
 */
function formatMetric(name, help, type, value, labels = null) {
  let labelStr = "";
  if (labels && typeof labels === "object") {
    const entries = Object.entries(labels)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}="${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    if (entries.length > 0) {
      labelStr = `{${entries.join(",")}}`;
    }
  }

  return (
    `# HELP ${name} ${help}\n` +
    `# TYPE ${name} ${type}\n` +
    `${name}${labelStr} ${value}\n`
  );
}

/**
 * Renders all system, cache, and routing metrics into Prometheus text format.
 * @returns {Promise<string>}
 */
export async function renderPrometheusMetrics() {
  const lines = [];

  // 1. Process Metrics
  const mem = process.memoryUsage();
  lines.push(formatMetric("axonrouter_process_uptime_seconds", "Process uptime in seconds", "gauge", process.uptime().toFixed(2)));
  lines.push(formatMetric("axonrouter_process_resident_memory_bytes", "Process resident memory size in bytes", "gauge", mem.rss));
  lines.push(formatMetric("axonrouter_process_heap_used_bytes", "Process heap memory used in bytes", "gauge", mem.heapUsed));
  lines.push(formatMetric("axonrouter_process_heap_total_bytes", "Process heap memory total allocated in bytes", "gauge", mem.heapTotal));
  if (mem.external !== undefined) {
    lines.push(formatMetric("axonrouter_process_external_memory_bytes", "Process external memory in bytes", "gauge", mem.external));
  }

  // 2. Cache / Speed-Layer Metrics
  try {
    const cacheKeys = memSize();
    lines.push(formatMetric("axonrouter_cache_keys_total", "Number of keys active in in-memory speed layer", "gauge", cacheKeys));
  } catch {
    lines.push(formatMetric("axonrouter_cache_keys_total", "Number of keys active in in-memory speed layer", "gauge", 0));
  }

  // 3. Database Connectivity Check
  let pgUp = 0;
  try {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const db = await getAdapter();
    const res = await db.get("SELECT 1 as ok");
    if (res?.ok) pgUp = 1;
  } catch {}
  lines.push(formatMetric("axonrouter_postgres_up", "PostgreSQL database connectivity (1 = up, 0 = down)", "gauge", pgUp));

  // 4. Routing Metrics from open-sse
  const routing = getRoutingMetrics();
  const routingMetricDefs = [
    { key: "upstreamAttempts", name: "axonrouter_routing_upstream_attempts_total", type: "counter", help: "Total upstream request attempts" },
    { key: "comboRequests", name: "axonrouter_routing_combo_requests_total", type: "counter", help: "Total combo-routed requests" },
    { key: "autoSwitchOverrides", name: "axonrouter_routing_auto_switch_overrides_total", type: "counter", help: "Capability-based auto-switch overrides" },
    { key: "rotationBudgetExhaustions", name: "axonrouter_routing_rotation_budget_exhaustions_total", type: "counter", help: "Requests aborted due to rotation budget limit" },
    { key: "failoverDemotions", name: "axonrouter_routing_failover_demotions_total", type: "counter", help: "Member failover demotions" },
    { key: "stillbornStreams", name: "axonrouter_routing_stillborn_streams_total", type: "counter", help: "Streams that died before first frame" },
    { key: "circuitTrips", name: "axonrouter_routing_circuit_trips_total", type: "counter", help: "Circuit breaker trips" },
    { key: "lkgHits", name: "axonrouter_routing_lkg_hits_total", type: "counter", help: "Last-known-good route hits" },
    { key: "lkgStale", name: "axonrouter_routing_lkg_stale_total", type: "counter", help: "Stale LKG route invalidations" },
    { key: "comboDeadMemberSkips", name: "axonrouter_routing_combo_dead_member_skips_total", type: "counter", help: "Dead combo members skipped" },
    { key: "comboExhaustedMemberSkips", name: "axonrouter_routing_combo_exhausted_member_skips_total", type: "counter", help: "Exhausted combo members skipped" },
    { key: "comboClientAbortStops", name: "axonrouter_routing_combo_client_abort_stops_total", type: "counter", help: "Combo loops halted due to client disconnect" },
    { key: "avgUpstreamAttemptsPerCombo", name: "axonrouter_routing_avg_upstream_attempts_per_combo", type: "gauge", help: "Average upstream attempts per combo request" },
  ];

  for (const def of routingMetricDefs) {
    const val = routing[def.key];
    if (val !== undefined) {
      lines.push(formatMetric(def.name, def.help, def.type, val));
    }
  }

  return lines.join("\n") + "\n";
}

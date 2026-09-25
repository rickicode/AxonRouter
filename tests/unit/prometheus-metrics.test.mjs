import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderPrometheusMetrics } from "../../src/lib/observability/prometheusMetrics.js";

describe("Prometheus Metrics Exporter", () => {
  it("renders valid Prometheus exposition format (version 0.0.4)", async () => {
    const text = await renderPrometheusMetrics();

    assert.equal(typeof text, "string");
    assert.equal(text.endsWith("\n"), true);

    // Process metrics
    assert.match(text, /# HELP axonrouter_process_uptime_seconds/);
    assert.match(text, /# TYPE axonrouter_process_uptime_seconds gauge/);
    assert.match(text, /axonrouter_process_uptime_seconds \d+/);

    assert.match(text, /# HELP axonrouter_process_resident_memory_bytes/);
    assert.match(text, /# TYPE axonrouter_process_resident_memory_bytes gauge/);
    assert.match(text, /axonrouter_process_resident_memory_bytes \d+/);

    assert.match(text, /# HELP axonrouter_process_heap_used_bytes/);
    assert.match(text, /# TYPE axonrouter_process_heap_used_bytes gauge/);

    // Speed-layer cache metrics
    assert.match(text, /# HELP axonrouter_cache_keys_total/);
    assert.match(text, /# TYPE axonrouter_cache_keys_total gauge/);

    // Postgres connectivity metric
    assert.match(text, /# HELP axonrouter_postgres_up/);
    assert.match(text, /# TYPE axonrouter_postgres_up gauge/);

    // Routing metrics from open-sse
    assert.match(text, /# HELP axonrouter_routing_upstream_attempts_total/);
    assert.match(text, /# TYPE axonrouter_routing_upstream_attempts_total counter/);

    assert.match(text, /# HELP axonrouter_routing_combo_requests_total/);
    assert.match(text, /# TYPE axonrouter_routing_combo_requests_total counter/);

    assert.match(text, /# HELP axonrouter_routing_circuit_trips_total/);
    assert.match(text, /# TYPE axonrouter_routing_circuit_trips_total counter/);
  });
});

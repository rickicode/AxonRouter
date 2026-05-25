import { describe, expect, it } from "vitest";

import { validateUnifiedRequestBody } from "../../src/lib/routing/unifiedValidation.ts";
import { createFallbackGraph, evaluateFallbackGraph, recordFallbackVisit } from "../../src/lib/routing/fallbackGraph.ts";
import { appendRouteTraceEvent, createRouteTrace, sanitizeTracePayload } from "../../src/lib/tracing/routeDecisionTrace.ts";

describe("unified routing validation", () => {
  it("accepts text mode with messages", () => {
    const result = validateUnifiedRequestBody({
      mode: "text",
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result).toMatchObject({ ok: true, mode: "text" });
  });

  it("rejects image mode without prompt", () => {
    const result = validateUnifiedRequestBody({
      mode: "image",
      model: "openai/gpt-image-1",
    });

    expect(result).toMatchObject({ ok: false, code: "missing_prompt", status: 400 });
  });

  it("rejects unsupported mode", () => {
    const result = validateUnifiedRequestBody({
      mode: "music",
      model: "foo/bar",
    });

    expect(result).toMatchObject({ ok: false, code: "unsupported_mode", status: 400 });
  });
});

describe("fallback graph", () => {
  it("selects primary then fallback in order", () => {
    const graph = createFallbackGraph({
      primary: { id: "primary", provider: "openai", model: "gpt-4o" },
      fallbacks: [{ id: "fallback-1", provider: "openrouter", model: "gpt-4o" }],
      budgets: { maxHops: 2, retryBudget: 1 },
    });

    const first = evaluateFallbackGraph(graph, { visited: [], hops: 0, retryCount: 0 });
    expect(first.next.id).toBe("primary");
    expect(first.reason).toBe("primary");

    const state = recordFallbackVisit({ visited: [], hops: 0, retryCount: 0 }, first.next);
    const second = evaluateFallbackGraph(graph, state);
    expect(second.next.id).toBe("fallback-1");
    expect(second.reason).toBe("fallback");
  });
});

describe("route decision trace", () => {
  it("redacts sensitive fields and appends trace events", () => {
    const trace = createRouteTrace({ correlationId: "corr-1", mode: "text", requestedModel: "openai/gpt-4o" });
    appendRouteTraceEvent(trace, "select", {
      prompt: "this is a secret prompt",
      provider: "openai",
    });

    expect(trace.events).toHaveLength(1);
    expect(trace.events[0].payload.prompt).toContain("[redacted]");
    expect(trace.correlation_id).toBe("corr-1");
  });

  it("sanitizes token-like payload keys", () => {
    const payload = sanitizeTracePayload({ api_key: "sk-1234567890abcdef", prompt_tokens: 1234, model: "x" });
    expect(String(payload.api_key)).toContain("[redacted]");
    expect(String(payload.prompt_tokens)).toContain("[redacted]");
    expect(payload.model).toBe("x");
  });
});

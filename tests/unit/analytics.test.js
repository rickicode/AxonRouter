import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: vi.fn() }));
import { observeChatAttempt } from "../../src/lib/observeChatAttempt.js";
import {
  validateAnalyticsFilters,
  validateProviderFilter,
  validateModelFilter,
} from "../../src/lib/analyticsFilters.js";
import { sanitizeAnalyticsEvent } from "../../src/lib/db/repos/analyticsRepo.js";
import {
  normalizeAnalytics,
  rankModels,
  analyticsUrl,
} from "../../src/app/(dashboard)/dashboard/usage/components/analyticsData.js";
async function observe(text, type = "text/event-stream") {
  const recorder = { usage: vi.fn(), finish: vi.fn() };
  const result = await observeChatAttempt(
    { modelInfo: { provider: "test", model: "model" } },
    async () => ({
      success: true,
      response: new Response(text, { headers: { "content-type": type } }),
    }),
    () => recorder,
  );
  expect(await result.response.text()).toBe(text);
  return recorder;
}
describe("Analytics safety and contract", () => {
  it("records completed streaming success with usage", async () => {
    const r = await observe(
      'data: {"usage":{"prompt_tokens":2}}\n\ndata: [DONE]\n\n',
    );
    expect(r.finish).toHaveBeenCalledWith(true, expect.any(Object));
    expect(r.usage).toHaveBeenCalledWith({ prompt_tokens: 2 });
  });
  it("does not count HTTP200 stream error as success", async () => {
    const r = await observe(
      'data: {"error":{"message":"bad"}}\n\ndata: [DONE]\n\n',
    );
    expect(r.finish).toHaveBeenCalledWith(false, expect.any(Object));
  });
  it("marks truncated stream failed", async () => {
    const r = await observe(
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
    );
    expect(r.finish).toHaveBeenCalledWith(false, expect.any(Object));
  });
  it("preserves nonstream JSON bytes", async () => {
    const r = await observe(
      '{"choices":[],"usage":{"completion_tokens":3}}',
      "application/json",
    );
    expect(r.finish).toHaveBeenCalledWith(true, expect.any(Object));
  });
  it("rejects excessive ranges and unsafe buckets", () => {
    expect(() =>
      validateAnalyticsFilters({ timeBucket: "1 hour';DROP" }),
    ).toThrow();
    expect(() =>
      validateAnalyticsFilters({ timeFrom: "2000-01-01T00:00:00Z" }),
    ).toThrow();
  });
  it("only retains telemetry fields", () => {
    const e = sanitizeAnalyticsEvent({
      provider: "test",
      model: "x",
      success: true,
      prompt: "secret",
      apiKey: "secret",
    });
    expect(e).not.toHaveProperty("prompt");
    expect(e).not.toHaveProperty("apiKey");
    expect(e.input_tokens).toBeNull();
  });
  it("normalizes postgres strings and excludes small samples", () => {
    const d = normalizeAnalytics({
      summary: {},
      meta: { minSampleThreshold: 30 },
      byModel: [
        {
          provider: "p",
          model: "m",
          count: 40,
          success_count: 39,
          failure_count: 1,
          p50_latency_ms: 100,
          latency_samples: 39,
        },
      ],
      timeline: [],
    });
    expect(d.models[0].successRate).toBe(0.975);
    expect(rankModels(d.models, "fastest")).toHaveLength(1);
    expect(
      rankModels([{ ...d.models[0], latencySamples: 1 }], "fastest"),
    ).toHaveLength(0);
  });
  it("uses supported API time filter contract", () => {
    const url = analyticsUrl(
      { period: "24h" },
      new Date("2026-09-09T00:00:00Z"),
    );
    expect(url).toContain("timeFrom=");
    expect(url).not.toContain("period=");
  });
  it("validates and accepts errorCategory filter", () => {
    const valid = validateAnalyticsFilters({
      errorCategory: "upstream",
      timeFrom: "2026-09-08T00:00:00Z",
      timeTo: "2026-09-09T00:00:00Z",
    });
    expect(valid.errorCategory).toBe("upstream");

    expect(() =>
      validateAnalyticsFilters({
        errorCategory: "non_existent_category",
        timeFrom: "2026-09-08T00:00:00Z",
        timeTo: "2026-09-09T00:00:00Z",
      }),
    ).toThrow("Invalid errorCategory");

    const url = analyticsUrl({
      period: "24h",
      errorCategory: "upstream",
    });
    expect(url).toContain("errorCategory=upstream");
  });

  it("validates provider and model dimensions and boundaries", () => {
    expect(validateProviderFilter("openai")).toEqual({ valid: true });
    expect(validateProviderFilter("")).toEqual({ valid: true });
    expect(validateProviderFilter(undefined)).toEqual({ valid: true });
    expect(validateProviderFilter("a".repeat(65)).valid).toBe(false);
    expect(validateProviderFilter("  openai  ").valid).toBe(false);
    expect(validateProviderFilter("open\x00ai").valid).toBe(false);

    expect(validateModelFilter("gpt-4o")).toEqual({ valid: true });
    expect(validateModelFilter("")).toEqual({ valid: true });
    expect(validateModelFilter(undefined)).toEqual({ valid: true });
    expect(validateModelFilter("m".repeat(257)).valid).toBe(false);
    expect(validateModelFilter("  gpt-4o  ").valid).toBe(false);
    expect(validateModelFilter("gpt\x1fo").valid).toBe(false);

    const valid = validateAnalyticsFilters({
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      timeFrom: "2026-09-08T00:00:00Z",
      timeTo: "2026-09-09T00:00:00Z",
    });
    expect(valid.provider).toBe("anthropic");
    expect(valid.model).toBe("claude-3-5-sonnet");

    expect(() =>
      validateAnalyticsFilters({
        provider: "p".repeat(65),
        timeFrom: "2026-09-08T00:00:00Z",
        timeTo: "2026-09-09T00:00:00Z",
      }),
    ).toThrow(/Invalid provider/);

    expect(() =>
      validateAnalyticsFilters({
        model: "m".repeat(257),
        timeFrom: "2026-09-08T00:00:00Z",
        timeTo: "2026-09-09T00:00:00Z",
      }),
    ).toThrow(/Invalid model/);

    expect(() =>
      validateAnalyticsFilters({
        provider: "  leading-space",
        timeFrom: "2026-09-08T00:00:00Z",
        timeTo: "2026-09-09T00:00:00Z",
      }),
    ).toThrow(/Invalid provider/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearComboRotationState, handleComboChat, getRotatedModels } from "../../open-sse/services/combo.tsx";

describe("combo runtime parity", () => {
  beforeEach(() => {
    clearComboRotationState();
  });

  it("keeps priority strategy order stable", () => {
    expect(getRotatedModels(["openai/gpt-4.1", "openai/gpt-4o-mini"], "research", "round-robin")).toEqual([
      "openai/gpt-4.1",
      "openai/gpt-4o-mini",
    ]);
  });

  it("falls through combo models until one succeeds", async () => {
    const handleSingleModel = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "primary fail" } }), { status: 503, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await handleComboChat({
      body: { model: "research" },
      models: ["openai/gpt-4.1", "openai/gpt-4o-mini"],
      handleSingleModel,
      log: { info: vi.fn(), warn: vi.fn() },
    });

    expect(handleSingleModel).toHaveBeenCalledTimes(2);
    expect(handleSingleModel.mock.calls[1][1]).toBe("openai/gpt-4o-mini");
    expect(response.ok).toBe(true);
  });

  it("returns the first successful combo model without checking private preflight hooks", async () => {
    const handleSingleModel = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await handleComboChat({
      body: { model: "research" },
      models: ["openai/gpt-4.1", "openai/gpt-4o-mini"],
      handleSingleModel,
      log: { info: vi.fn(), warn: vi.fn() },
    });

    expect(handleSingleModel).toHaveBeenCalledTimes(1);
    expect(handleSingleModel.mock.calls[0][1]).toBe("openai/gpt-4.1");
    expect(response.ok).toBe(true);
  });


  // Regression: client errors (400/401/403/422) are NOT model-health signals.
  it("does NOT record circuit-breaker failure for non-fallback (client) errors", async () => {
    const modelKey = "openai/gpt-4.1";
    resetCircuitBreaker(modelKey);
    const cbBefore = getCircuitBreaker(modelKey).getStatus();

    const handleSingleModel = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "upstream down" } }), { status: 503, headers: { "Content-Type": "application/json" } }));

    await handleComboChat({
      body: { model: "research" },
      models: [modelKey, "openai/gpt-4o-mini"],
      handleSingleModel,
      log: { info: vi.fn(), warn: vi.fn() },
    });

    expect(getCircuitBreaker(modelKey).getStatus().failures).toBe(cbBefore.failures);
    resetCircuitBreaker(modelKey);
  });

  // Regression: timeouts are NOT model failures.
  it("does NOT record circuit-breaker failure for per-attempt timeouts", async () => {
    const modelKey = "openai/gpt-4.1";
    resetCircuitBreaker(modelKey);
    const cbBefore = getCircuitBreaker(modelKey).getStatus();

    const handleSingleModel = vi.fn().mockImplementation(
      () => new Promise<Response>(() => {}),
    );

    await handleComboChat({
      body: { model: "research" },
      models: [modelKey],
      handleSingleModel,
      log: { info: vi.fn(), warn: vi.fn() },
      combo: { config: { perAttemptTimeoutMs: 50 } },
      comboName: "research",
      comboStrategy: "round-robin",
    });

    expect(getCircuitBreaker(modelKey).getStatus().failures).toBe(cbBefore.failures);
    resetCircuitBreaker(modelKey);
  });
});

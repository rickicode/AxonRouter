import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearComboRotationState, handleComboChat, getRotatedModels } from "../../open-sse/services/combo.tsx";

describe("combo runtime parity", () => {
  beforeEach(() => {
    clearComboRotationState();
  });

  it("keeps priority strategy order stable", () => {
    expect(getRotatedModels(["openai/gpt-4.1", "openai/gpt-4o-mini"], "research", "priority")).toEqual([
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
});

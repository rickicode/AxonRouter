import { describe, expect, it } from "vitest";
import { PROVIDER_MODELS } from "../../open-sse/config/providerModels.ts";

describe("provider model catalog", () => {
  it("includes gpt-5.5 for codex and openai", () => {
    expect(PROVIDER_MODELS.cx.some((model) => model.id === "gpt-5.5")).toBe(true);
    expect(PROVIDER_MODELS.openai.some((model) => model.id === "gpt-5.5")).toBe(true);
  });

  it("marks codex gpt-5.5 as premium", () => {
    expect(PROVIDER_MODELS.cx.find((model) => model.id === "gpt-5.5")).toMatchObject({ premium: true });
    expect(PROVIDER_MODELS.openai.find((model) => model.id === "gpt-5.5")).not.toHaveProperty("premium", true);
  });

  it("includes current OpenCode Free public models as static fallbacks", () => {
    expect(PROVIDER_MODELS.oc.map((model) => model.id)).toEqual(expect.arrayContaining([
      "big-pickle",
      "deepseek-v4-flash-free",
      "mimo-v2.5-free",
      "qwen3.6-plus-free",
      "minimax-m2.5-free",
      "nemotron-3-super-free",
    ]));
  });
});

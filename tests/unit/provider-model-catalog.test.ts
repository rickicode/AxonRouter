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
      "minimax-m2.5-free",
      "ling-2.6-1t-free",
      "trinity-large-preview-free",
      "nemotron-3-super-free",
    ]));
  });
});

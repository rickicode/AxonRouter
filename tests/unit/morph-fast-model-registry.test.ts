import { describe, expect, it } from "vitest";

import {
  MORPH_FAST_MODELS,
  isMorphFastModel,
  getMorphFastModel,
  isMorphAutoModel,
  isValidModel,
} from "../../src/shared/constants/models.ts";

describe("Morph fast model registry", () => {
  it("declares the shared Morph fast catalog", () => {
    expect(MORPH_FAST_MODELS.map((model) => model.id)).toEqual([
      "auto",
      "auto-manual",
      "morph-qwen35-397b",
      "morph-dsv4flash",
      "morph-minimax27-230b",
      "morph-qwen36-27b",
    ]);
  });

  it("publishes runtime-verified Morph context windows alongside documented values", () => {
    expect(getMorphFastModel("auto-manual")).toMatchObject({
      contextWindow: 196608,
      documentedContextWindow: 262000,
      verifiedRuntimeContextWindow: 196608,
      contextWindowSource: "runtime-verified",
    });
    expect(getMorphFastModel("morph-qwen35-397b")).toMatchObject({
      contextWindow: 196608,
      documentedContextWindow: 262000,
      verifiedRuntimeContextWindow: 196608,
      contextWindowSource: "runtime-verified",
    });
    expect(getMorphFastModel("morph-dsv4flash")).toMatchObject({
      contextWindow: 393000,
      documentedContextWindow: 393000,
      contextWindowSource: "documented",
      pricing: { input: 0.3, output: 0.4 },
    });
    expect(getMorphFastModel("morph-minimax27-230b")).toMatchObject({
      contextWindow: 196608,
      documentedContextWindow: 200000,
      verifiedRuntimeContextWindow: 196608,
      contextWindowSource: "runtime-verified",
      pricing: { input: 0.279, output: 1.2 },
    });
    expect(getMorphFastModel("morph-qwen36-27b")).toMatchObject({
      contextWindow: 131072,
      documentedContextWindow: 131000,
      verifiedRuntimeContextWindow: 131072,
      contextWindowSource: "runtime-verified",
      pricing: { input: 0.498, output: 2.4 },
    });
  });

  it("recognizes Morph fast model ids", () => {
    expect(isMorphFastModel("auto")).toBe(true);
    expect(isMorphFastModel("auto-manual")).toBe(true);
    expect(isMorphFastModel("morph-qwen35-397b")).toBe(true);
    expect(isMorphFastModel("morph-dsv4flash")).toBe(true);
    expect(isMorphFastModel("morph-qwen36-27b")).toBe(true);
    expect(isMorphFastModel("morph-embedding-v4")).toBe(false);
    expect(isMorphFastModel("morph-v3-fast")).toBe(false);
  });

  it("distinguishes Morph auto aliases from concrete Morph models", () => {
    expect(isMorphAutoModel("auto")).toBe(true);
    expect(isMorphAutoModel("auto-manual")).toBe(true);
    expect(isMorphAutoModel("morph-qwen35-397b")).toBe(false);
    expect(isMorphAutoModel("morph-dsv4flash")).toBe(false);
  });

  it("resolves Morph fast models from the provider registry helpers", () => {
    expect(getMorphFastModel("morph-qwen36-27b")).toMatchObject({ id: "morph-qwen36-27b" });
    expect(isValidModel("morph-fast", "morph-qwen36-27b")).toBe(true);
    expect(isValidModel("morph", "morph-qwen36-27b")).toBe(true);
    expect(isValidModel("morph-fast", "morph-v3-large")).toBe(false);
  });
});

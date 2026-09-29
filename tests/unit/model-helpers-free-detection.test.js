import { describe, expect, it } from "vitest";
import { isFreeModel } from "@/shared/utils/modelHelpers.js";

describe("isFreeModel — cline-free dynamic models without 'free' substring", () => {
  it("detects cline-free models by provider id suffix (-free)", () => {
    // These models lack the word "free" in id/name — before the fix they were
    // silently filtered out of ModelSelectModal for cline-free provider.
    expect(isFreeModel({ id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" }, "cline-free")).toBe(true);
    expect(isFreeModel({ id: "meta/muse-spark-1.3-contributor", name: "Muse Spark 1.3 Contributor" }, "cline-free")).toBe(true);
    expect(isFreeModel({ id: "xiaomi/mimo-v2.6-flash", name: "MiMo-V2.6-Flash" }, "cline-free")).toBe(true);
  });

  it("detects models from other -free providers (kilocode-free, ovhcloud-free)", () => {
    expect(isFreeModel({ id: "some-model", name: "Some Model" }, "kilocode-free")).toBe(true);
    expect(isFreeModel({ id: "mistral-nemo", name: "Mistral Nemo" }, "ovhcloud-free")).toBe(true);
  });

  it("keeps name-aware fallback intact on other providers", () => {
    // Non-free provider id, but the model itself has "Free" in name.
    expect(isFreeModel({ id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash (Free)" }, "kilocode")).toBe(true);
  });

  it("keeps paid models on non-free providers excluded", () => {
    expect(isFreeModel({ id: "gpt-5.2", name: "GPT-5.2" }, "codex")).toBe(false);
    expect(isFreeModel({ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }, "claude")).toBe(false);
  });

  it("accepts string form with -free provider prefix", () => {
    expect(isFreeModel("cline-free/deepseek-v4.1-flash")).toBe(true);
    expect(isFreeModel("ovhcloud-free/mistral-nemo")).toBe(true);
  });

  it("does not false-positive on providers containing 'free' mid-word", () => {
    // "freebird" provider should NOT auto-match unless it actually ends with -free
    expect(isFreeModel({ id: "some-model", name: "Some Model" }, "freebird")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  canCodexConnectionUseModel,
  filterCodexModelsForConnection,
  isCodexFreePlan,
  isCodexPremiumModel,
} from "../../src/lib/codexModelAccess.ts";

describe("codex model access", () => {
  it("treats no models as premium Codex models", () => {
    expect(isCodexPremiumModel("gpt-5.5")).toBe(false);
    expect(isCodexPremiumModel("gpt-5.4")).toBe(false);
  });

  it("detects Codex free plans from canonical providerSpecificData", () => {
    expect(isCodexFreePlan({ provider: "codex", providerSpecificData: { planType: "Free" } })).toBe(true);
    expect(isCodexFreePlan({ provider: "codex", providerSpecificData: { planTypeRaw: "free" } })).toBe(true);
    expect(isCodexFreePlan({ provider: "codex", providerSpecificData: { usageWindowType: "weekly_only" } })).toBe(true);
    expect(isCodexFreePlan({ provider: "codex", providerSpecificData: { planType: "Plus" } })).toBe(false);
  });

  it("does not block any Codex models for free accounts", () => {
    const freeConnection = { provider: "codex", providerSpecificData: { planType: "Free" } };
    const plusConnection = { provider: "codex", providerSpecificData: { planType: "Plus" } };

    expect(canCodexConnectionUseModel(freeConnection, "gpt-5.5")).toBe(true);
    expect(canCodexConnectionUseModel(freeConnection, "gpt-5.4")).toBe(true);
    expect(canCodexConnectionUseModel(plusConnection, "gpt-5.5")).toBe(true);
  });

  it("does not filter any Codex models out of free-account model lists", () => {
    const freeConnection = { provider: "codex", providerSpecificData: { planTypeRaw: "free" } };
    const models = [
      { id: "gpt-5.5", name: "GPT 5.5" },
      { id: "gpt-5.4", name: "GPT 5.4" },
    ];

    expect(filterCodexModelsForConnection(freeConnection, models)).toEqual([
      { id: "gpt-5.5", name: "GPT 5.5" },
      { id: "gpt-5.4", name: "GPT 5.4" },
    ]);
  });
});

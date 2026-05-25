import { describe, expect, it } from "vitest";

import { filterCodexModelsForConnections } from "../../src/lib/codexModelAccess.ts";

describe("codex UI model filtering", () => {
  const models = [
    { id: "gpt-5.5", name: "GPT 5.5", premium: true },
    { id: "gpt-5.4", name: "GPT 5.4" },
  ];

  it("hides premium Codex models when no Codex connections are available", () => {
    expect(filterCodexModelsForConnections([], models)).toEqual([
      { id: "gpt-5.4", name: "GPT 5.4" },
    ]);
  });

  it("hides premium Codex models when only free Codex connections exist", () => {
    const freeConnections = [
      { provider: "codex", providerSpecificData: { planType: "Free", planTypeRaw: "free" } },
    ];

    expect(filterCodexModelsForConnections(freeConnections, models)).toEqual([
      { id: "gpt-5.4", name: "GPT 5.4" },
    ]);
  });

  it("shows premium Codex models when at least one non-free Codex connection exists", () => {
    const mixedConnections = [
      { provider: "codex", providerSpecificData: { planType: "Free", planTypeRaw: "free" } },
      { provider: "codex", providerSpecificData: { planType: "Plus", planTypeRaw: "plus" } },
    ];

    expect(filterCodexModelsForConnections(mixedConnections, models)).toEqual(models);
  });
});

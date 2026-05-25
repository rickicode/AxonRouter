import { describe, expect, it } from "vitest";
import { buildGroupedSelectableModels } from "../../src/lib/opencodeSync/modelSelectOptions.ts";

describe("buildGroupedSelectableModels compatible-provider imported merge", () => {
  it("includes imported models for compatible providers alongside alias-backed models", () => {
    const grouped = buildGroupedSelectableModels({
      activeProviders: [{ provider: "compat-1", name: "Compat One", providerSpecificData: { prefix: "cxlike" } }],
      modelAliases: { writer: "compat-1/gpt-4.1" },
      providerNodes: [{ id: "compat-1", prefix: "cxlike", name: "Compat One" }],
      providerModelsByProvider: {
        "compat-1": [{ id: "gpt-4.1-preview", name: "GPT 4.1 Preview", source: "imported" }],
      },
    });

    expect(grouped["compat-1"].models).toEqual([
      expect.objectContaining({ id: "gpt-4.1-preview", name: "GPT 4.1 Preview", source: "imported", value: "compat-1/gpt-4.1-preview" }),
    ]);
  });
});

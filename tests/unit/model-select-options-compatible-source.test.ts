import { describe, expect, it } from "vitest";
import { buildGroupedSelectableModels } from "../../src/lib/opencodeSync/modelSelectOptions.ts";

describe("buildGroupedSelectableModels compatible-provider source semantics", () => {
  it("marks alias-backed compatible models with source alias and imported models with source imported", () => {
    const providerId = "openai-compatible-1";
    const grouped = buildGroupedSelectableModels({
      activeProviders: [{ provider: providerId, name: "Compat One", providerSpecificData: { prefix: "cxlike" } }],
      modelAliases: { writer: `${providerId}/gpt-4.1` },
      providerNodes: [{ id: providerId, prefix: "cxlike", name: "Compat One" }],
      providerModelsByProvider: {
        [providerId]: [{ id: "gpt-4.1-preview", name: "GPT 4.1 Preview", source: "imported" }],
      },
    });

    expect(grouped[providerId].models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "gpt-4.1-preview", source: "imported" }),
        expect.objectContaining({ id: "gpt-4.1", source: "alias" }),
      ])
    );
  });
});

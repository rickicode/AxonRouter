import { beforeEach, describe, expect, it, vi } from "vitest";

const getAggregateProviderModelsByProvider = vi.fn();

vi.mock("@/lib/providerModels/aggregate", () => ({
  getAggregateProviderModelsByProvider,
}));

describe("provider-models aggregate route", () => {
  beforeEach(() => {
    vi.resetModules();
    getAggregateProviderModelsByProvider.mockReset();
  });

  it("returns merged aggregate provider models", async () => {
    getAggregateProviderModelsByProvider.mockResolvedValue({
      codex: [
        { id: "gpt-5.4", name: "GPT 5.4", source: "imported" },
        { id: "gpt-5.4-custom", name: "GPT 5.4 Custom", source: "custom", providerAlias: "codex" },
      ],
    });

    const route = await import("../../src/app/api/provider-models/route.ts");
    const response = await route.GET(new Request("http://localhost/api/provider-models?provider=codex"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.provider).toBe("codex");
    expect(json.models).toEqual([
      { id: "gpt-5.4", name: "GPT 5.4", source: "imported" },
      { id: "gpt-5.4-custom", name: "GPT 5.4 Custom", source: "custom", providerAlias: "codex" },
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderConnections = vi.fn();
const getCombos = vi.fn();
const getModelAliases = vi.fn();
const getDisabledModels = vi.fn();
const getAggregateProviderModelsByProvider = vi.fn();
const getConfiguredMorphSettings = vi.fn();

vi.mock("@/lib/connectionAccess", () => ({
  getCurrentProviderConnections: getProviderConnections,
}));

vi.mock("@/lib/modelCatalogAccess", () => ({
  getCurrentCombos: getCombos,
  getCurrentDisabledModels: getDisabledModels,
}));

vi.mock("@/lib/modelAliasAccess", () => ({
  getCurrentModelAliases: getModelAliases,
}));

vi.mock("@/sse/services/apiKeyAuth", () => ({
  extractApiKey: () => null,
  hasApiKeys: () => Promise.resolve(false),
  isValidApiKey: () => Promise.resolve(true),
}));

vi.mock("@/lib/providerModels/aggregate", () => ({
  getAggregateProviderModelsByProvider,
}));

vi.mock("@/app/api/morph/_shared", () => ({
  getConfiguredMorphSettings,
}));

vi.mock("@/lib/routing/virtualModelResolver", () => ({
  VIRTUAL_SYSTEM_MODELS: {},
}));

describe("/v1/models synced catalog merge", () => {
  beforeEach(() => {
    vi.resetModules();
    getProviderConnections.mockReset();
    getCombos.mockReset();
    getModelAliases.mockReset();
    getDisabledModels.mockReset();
    getAggregateProviderModelsByProvider.mockReset();
    getConfiguredMorphSettings.mockReset();

    getProviderConnections.mockResolvedValue([
      {
        id: "conn-codex-1",
        provider: "codex",
        isActive: true,
        providerSpecificData: {},
      },
    ]);
    getCombos.mockResolvedValue([]);
    getModelAliases.mockResolvedValue({});
    getDisabledModels.mockResolvedValue({});
    getAggregateProviderModelsByProvider.mockResolvedValue({
      codex: [
        { id: "gpt-5.4", name: "GPT 5.4", source: "imported" },
        { id: "gpt-5.4-preview", name: "GPT 5.4 Preview", source: "imported" },
      ],
    });
    getConfiguredMorphSettings.mockResolvedValue(null);
  });

  it("includes synced available models in the final v1 models response", async () => {
    const route = await import("../../src/app/api/v1/models/route.ts");
    const response = await route.GET(new Request("http://localhost/v1/models"));
    const json = await response.json();
    const ids = json.data.map((model) => model.id);

    expect(ids).toContain("cx/gpt-5.4");
    expect(ids).toContain("cx/gpt-5.4-preview");
  });
});

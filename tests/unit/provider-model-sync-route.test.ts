import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderConnectionById = vi.fn();
const importManagedModels = vi.fn();
const getProviderModels = vi.fn();

vi.mock("@/models", () => ({
  getProviderConnectionById,
}));

vi.mock("@/lib/providerModels/managedModelImport", () => ({
  importManagedModels,
}));

vi.mock("../../src/app/api/providers/[id]/models/route.ts", () => ({
  GET: getProviderModels,
}));

describe("provider model sync route", () => {
  beforeEach(() => {
    vi.resetModules();
    getProviderConnectionById.mockReset();
    importManagedModels.mockReset();
    getProviderModels.mockReset();
  });

  it("imports fetched provider models into synced available models", async () => {
    getProviderConnectionById.mockResolvedValue({
      id: "conn-1",
      provider: "codex",
    });
    getProviderModels.mockResolvedValue(
      new Response(JSON.stringify({ models: [{ id: "gpt-5.4", name: "GPT 5.4" }] }), { status: 200 })
    );
    importManagedModels.mockResolvedValue({
      syncedAvailableModels: [{ id: "gpt-5.4", name: "GPT 5.4", source: "imported" }],
      importedChanges: { added: 1, updated: 0, unchanged: 0, total: 1 },
    });

    const route = await import("../../src/app/api/providers/[id]/sync-models/route.ts");
    const response = await route.POST(new Request("http://localhost/api/providers/conn-1/sync-models?mode=import", { method: "POST" }), {
      params: Promise.resolve({ id: "conn-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getProviderModels).toHaveBeenCalled();
    expect(importManagedModels).toHaveBeenCalledWith(expect.objectContaining({
      providerId: "codex",
      connectionId: "conn-1",
      mode: "merge",
      fetchedModels: [{ id: "gpt-5.4", name: "GPT 5.4" }],
    }));
    expect(json).toMatchObject({
      provider: "codex",
      connectionId: "conn-1",
      fetchedCount: 1,
      syncedCount: 1,
      mode: "merge",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.fn();
const updateSettings = vi.fn();
const getEligibleModelSyncConnections = vi.fn();
const runModelSyncBatch = vi.fn();

vi.mock("@/lib/localDb", () => ({
  getSettings,
  updateSettings,
}));

vi.mock("@/lib/providerModels/syncRunner", () => ({
  getEligibleModelSyncConnections,
  runModelSyncBatch,
}));

describe("model-sync route", () => {
  beforeEach(() => {
    vi.resetModules();
    getSettings.mockReset();
    updateSettings.mockReset();
    getEligibleModelSyncConnections.mockReset();
    runModelSyncBatch.mockReset();
  });

  it("returns model sync settings and eligible connections", async () => {
    getSettings.mockResolvedValue({ modelSync: { enabled: true, intervalMinutes: 30, providers: {} } });
    getEligibleModelSyncConnections.mockResolvedValue([
      { id: "conn-1", provider: "codex", name: "Codex 1" },
    ]);

    const route = await import("../../src/app/api/model-sync/route.ts");
    const response = await route.GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.settings.enabled).toBe(true);
    expect(json.eligibleConnections).toHaveLength(1);
  });

  it("runs sync batch on POST", async () => {
    runModelSyncBatch.mockResolvedValue({ status: "success", results: [] });
    const route = await import("../../src/app/api/model-sync/route.ts");
    const response = await route.POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(runModelSyncBatch).toHaveBeenCalled();
    expect(json.status).toBe("success");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  json: vi.fn((body, init) => ({ status: init?.status || 200, body })),
  getById: vi.fn(async () => ({
    id: "ag-1",
    provider: "antigravity",
    providerSpecificData: {},
    modelLock_gemini: "2099-01-01T00:00:00.000Z",
  })),
  update: vi.fn(async (id, patch) => ({ id, ...patch })),
  deleteSnapshots: vi.fn(async () => 1),
  clearCache: vi.fn(),
  setAccountCooldown: vi.fn(async () => {}),
  clearProviderDead: vi.fn(async () => {}),
}));

vi.mock("next/server", () => ({
  NextResponse: { json: mocks.json },
}));

vi.mock("@/models", () => ({
  getProviderConnectionById: mocks.getById,
  updateProviderConnection: mocks.update,
}));

vi.mock("@/lib/db/repos/usageSnapshotsRepo.js", () => ({
  deleteUsageSnapshotsByConnectionIds: mocks.deleteSnapshots,
}));

vi.mock("@/sse/services/antigravityQuota", () => ({
  clearAntigravityConnectionCache: mocks.clearCache,
}));

vi.mock("@/lib/cache/client.js", () => ({
  setAccountCooldown: mocks.setAccountCooldown,
  clearProviderDead: mocks.clearProviderDead,
}));

const { POST } = await import("../../src/app/api/providers/[id]/reset-status/route.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/providers/[id]/reset-status — snapshot cleanup", () => {
  it("resets status AND deletes the persisted quota snapshot", async () => {
    const res = await POST({}, { params: Promise.resolve({ id: "ag-1" }) });
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("ag-1", expect.objectContaining({ testStatus: "active" }));
    expect(mocks.clearCache).toHaveBeenCalledWith("ag-1");
    expect(mocks.deleteSnapshots).toHaveBeenCalledWith(["ag-1"]);
  });

  it("404 when connection missing, no snapshot delete attempted", async () => {
    mocks.getById.mockResolvedValueOnce(null);
    const res = await POST({}, { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
    expect(mocks.deleteSnapshots).not.toHaveBeenCalled();
  });
});

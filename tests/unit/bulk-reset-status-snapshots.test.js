import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  json: vi.fn((body, init) => ({ status: init?.status || 200, body })),
  bulkReset: vi.fn(async () => ({ ok: true, count: 2 })),
  getBatchProviderQuotas: vi.fn(async () => [
    { connectionId: "ag-1" },
    { connectionId: "ag-2" },
  ]),
  deleteSnapshots: vi.fn(async () => 2),
  clearBatchCache: vi.fn(),
}));

vi.mock("@/lib/http/response.js", () => ({
  NextResponse: { json: mocks.json },
}));

vi.mock("@/models", () => ({
  bulkResetProviderConnectionsStatus: mocks.bulkReset,
}));

vi.mock("@/lib/db/repos/usageSnapshotsRepo.js", () => ({
  getBatchProviderQuotas: mocks.getBatchProviderQuotas,
  deleteUsageSnapshotsByConnectionIds: mocks.deleteSnapshots,
}));

vi.mock("@/sse/services/antigravityQuota", () => ({
  clearBatchAntigravityConnectionCache: mocks.clearBatchCache,
}));

const { POST } = await import("../../src/app/api/providers/bulk-reset-status/route.js");

const request = (body) => ({ json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/providers/bulk-reset-status — snapshot/RAM cleanup", () => {
  it("reset by provider resolves ids, clears RAM cache AND deletes snapshots", async () => {
    await POST(request({ provider: "antigravity" }));
    expect(mocks.bulkReset).toHaveBeenCalledWith({ provider: "antigravity", ids: undefined });
    expect(mocks.getBatchProviderQuotas).toHaveBeenCalledWith("antigravity");
    expect(mocks.clearBatchCache).toHaveBeenCalledWith(["ag-1", "ag-2"]);
    expect(mocks.deleteSnapshots).toHaveBeenCalledWith(["ag-1", "ag-2"]);
  });

  it("reset with explicit ids uses them directly without snapshot lookup", async () => {
    await POST(request({ ids: ["x-1"] }));
    expect(mocks.getBatchProviderQuotas).not.toHaveBeenCalled();
    expect(mocks.clearBatchCache).toHaveBeenCalledWith(["x-1"]);
    expect(mocks.deleteSnapshots).toHaveBeenCalledWith(["x-1"]);
  });

  it("snapshot-delete failure does not fail the reset", async () => {
    mocks.deleteSnapshots.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(request({ provider: "antigravity" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, count: 2 });
  });
});

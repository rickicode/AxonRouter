import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  all: vi.fn(async () => [{ provider: "antigravity" }, { provider: "antigravity" }]),
  cacheDelRaw: vi.fn(async () => {}),
}));

vi.mock("../../src/lib/db/driver.js", () => ({
  getAdapter: vi.fn(async () => ({ all: mocks.all })),
}));

vi.mock("@/lib/cache/client.js", () => ({
  cacheGetRaw: vi.fn(async () => null),
  cacheSetRaw: vi.fn(async () => {}),
  cacheDelRaw: mocks.cacheDelRaw,
  isCacheAvailable: vi.fn(() => true),
}));

const { deleteUsageSnapshotsByConnectionIds } = await import(
  "../../src/lib/db/repos/usageSnapshotsRepo.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteUsageSnapshotsByConnectionIds", () => {
  it("deletes by connection ids and invalidates the provider snapshot cache", async () => {
    const n = await deleteUsageSnapshotsByConnectionIds(["ag-1", "ag-2", "ag-1"]);
    expect(n).toBe(2);
    expect(mocks.all).toHaveBeenCalledTimes(1);
    const [sql, params] = mocks.all.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM usage_snapshots/i);
    expect(params).toEqual([["ag-1", "ag-2"]]);
    expect(mocks.cacheDelRaw).toHaveBeenCalledWith("agqsnap:antigravity");
  });

  it("empty input is a no-op (no DB call)", async () => {
    expect(await deleteUsageSnapshotsByConnectionIds([])).toBe(0);
    expect(await deleteUsageSnapshotsByConnectionIds(null)).toBe(0);
    expect(mocks.all).not.toHaveBeenCalled();
  });
});

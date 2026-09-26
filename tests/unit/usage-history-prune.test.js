import { describe, it, expect, vi, beforeEach } from "vitest";

describe("pruneUsageHistory unit test", () => {
  it("resolves parameters and executes deletion with cutoff", async () => {
    const executedQueries = [];
    const mockDb = {
      run: vi.fn(async (q, params) => {
        executedQueries.push({ q, params });
        return { changes: 50 };
      }),
      get: vi.fn(async (q, params) => {
        if (q.includes("COUNT(*)")) return { total: 150000 };
        if (q.includes("OFFSET")) return { timestamp: "2026-09-18T00:00:00.000Z", id: 200000 };
        return null;
      }),
    };

    vi.doMock("@/lib/db/driver.js", () => ({
      getAdapter: vi.fn(async () => mockDb),
    }));

    vi.doMock("@/lib/db/repos/settingsRepo.js", () => ({
      getSettings: vi.fn(async () => ({
        usageRetentionDays: 7,
        usageMaxRecords: 100000,
      })),
    }));

    const { pruneUsageHistory } = await import("@/lib/db/repos/usageRepo.js");

    const res = await pruneUsageHistory({ retentionDays: 7, maxRecords: 100000 });
    expect(res.deleted).toBeGreaterThan(0);
    expect(mockDb.run).toHaveBeenCalled();

    // Verify time-based deletion query was called
    const timeCall = executedQueries.find((x) => x.q.includes("timestamp < NOW()"));
    expect(timeCall).toBeDefined();
    expect(timeCall.params[0]).toBe(7);

    // Verify capacity-based deletion query was called
    const capCall = executedQueries.find((x) => x.q.includes("(timestamp, id) <="));
    expect(capCall).toBeDefined();
  });
});

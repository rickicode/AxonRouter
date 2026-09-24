import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression tests for the Antigravity exhaustion-lock failure:
// 1. The 409/429 error path must bypass the 30s refresh throttle — a throttled
//    refresh returns the stale optimistic cache that just failed, so the
//    exhaustion guard in markAccountUnavailable never sees the true 0% state
//    and the account stays `active` with no modelLock written.
// 2. The usage-snapshot write-through must be awaited before refresh returns,
//    so the durable PostgreSQL signal exists when markAccountUnavailable reads
//    it back in the same request cycle.

const mocks = vi.hoisted(() => ({
  getProviderConnectionById: vi.fn(),
  updateProviderConnection: vi.fn(),
  getAntigravityUsage: vi.fn(),
  setAccountCooldown: vi.fn(async () => true),
  clearModelCooldown: vi.fn(async () => true),
  setModelCooldown: vi.fn(async () => true),
  publishEvent: vi.fn(async () => {}),
  upsertUsageSnapshot: vi.fn(async () => {}),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: mocks.getProviderConnectionById,
  updateProviderConnection: mocks.updateProviderConnection,
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
}));

vi.mock("open-sse/services/usage/google.js", () => ({
  getAntigravityUsage: mocks.getAntigravityUsage,
}));

vi.mock("@/lib/db/repos/usageSnapshotsRepo.js", () => ({
  upsertUsageSnapshot: mocks.upsertUsageSnapshot,
}));

vi.mock("@/lib/cache/client.js", () => ({
  publishEvent: mocks.publishEvent,
  setModelCooldown: mocks.setModelCooldown,
  clearModelCooldown: mocks.clearModelCooldown,
  setAccountCooldown: mocks.setAccountCooldown,
}));

vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

const {
  refreshAntigravityQuota,
  handleAntigravityQuotaError,
} = await import("../../src/sse/services/antigravityQuota.js");

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const MODEL = "gemini-3.8-flash-high";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProviderConnectionById.mockResolvedValue(null);
});

describe("Antigravity error-path refresh", () => {
  it("bypasses the 30s throttle so a 429 sees fresh exhausted quota, not the stale optimistic cache", async () => {
    const connId = `ag-force-${Date.now()}-1`;

    // Seed the cache with an optimistic reading (the one that just 429'd).
    mocks.getAntigravityUsage.mockResolvedValueOnce({
      plan: "paid",
      quotas: { [MODEL]: { remainingPercentage: 80, resetAt: FUTURE } },
    });
    await refreshAntigravityQuota(connId, "tok-1", {});
    expect(mocks.getAntigravityUsage).toHaveBeenCalledTimes(1);

    // Upstream truth is now exhausted. The error path must re-read upstream
    // instead of returning the throttled optimistic cache (which would take
    // the strike-breaker path and return null, leaving the account active).
    mocks.getAntigravityUsage.mockResolvedValueOnce({
      plan: "paid",
      quotas: { [MODEL]: { remainingPercentage: 0, resetAt: FUTURE } },
    });
    const resetMs = await handleAntigravityQuotaError(connId, 429, MODEL, "tok-1", {});

    expect(mocks.getAntigravityUsage).toHaveBeenCalledTimes(2);
    expect(resetMs).toBeGreaterThan(Date.now());
  });

  it("persists the usage snapshot before refresh returns (durable exhaustion signal)", async () => {
    const connId = `ag-force-${Date.now()}-2`;
    let snapshotWritten = false;
    mocks.upsertUsageSnapshot.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 50));
      snapshotWritten = true;
    });
    mocks.getAntigravityUsage.mockResolvedValueOnce({
      plan: "paid",
      quotas: { [MODEL]: { remainingPercentage: 0, resetAt: FUTURE } },
    });

    await refreshAntigravityQuota(connId, "tok-2", {});

    // A fire-and-forget write would still be in flight here; awaiting it
    // guarantees markAccountUnavailable reads the fresh snapshot below.
    expect(mocks.upsertUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: connId,
        provider: "antigravity",
        remainingPct: 0,
      }),
    );
    expect(snapshotWritten).toBe(true);
  });
});

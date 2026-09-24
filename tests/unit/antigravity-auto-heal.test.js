import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { refreshAntigravityQuota } = await import("../../src/sse/services/antigravityQuota.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Antigravity auto-heal on quota restore", () => {
  it("automatically unmarks exhausted and clears model locks when upstream returns positive quota", async () => {
    const connId = "ag-auto-heal-1";
    mocks.getProviderConnectionById.mockResolvedValue({
      id: connId,
      provider: "antigravity",
      isActive: true,
      testStatus: "exhausted",
      lockedAllUntil: new Date(Date.now() + 3600000).toISOString(),
      "modelLock_gemini-3.8-flash-high": new Date(Date.now() + 3600000).toISOString(),
      modelLocks: { "gemini-3.8-flash-high": new Date(Date.now() + 3600000).toISOString() },
    });

    mocks.getAntigravityUsage.mockResolvedValue({
      plan: "paid",
      quotas: {
        "gemini-3.8-flash-high": { remainingPercentage: 100, resetAt: new Date(Date.now() + 7200000).toISOString() },
      },
    });

    await refreshAntigravityQuota(connId, "tok-1", {});

    expect(mocks.updateProviderConnection).toHaveBeenCalledWith(
      connId,
      expect.objectContaining({
        testStatus: "active",
        lockedAllUntil: null,
        "modelLock_gemini-3.8-flash-high": null,
        modelLocks: {},
      }),
    );
    expect(mocks.setAccountCooldown).toHaveBeenCalledWith(connId, 0);
    expect(mocks.clearModelCooldown).toHaveBeenCalledWith(connId, "gemini-3.8-flash-high");
  });

  it("heals a stale exhausted flag when Claude family still serves while Gemini sits at 0%", async () => {
    const connId = "ag-auto-heal-2";
    mocks.getProviderConnectionById.mockResolvedValue({
      id: connId,
      provider: "antigravity",
      isActive: true,
      testStatus: "exhausted",
      lockedAllUntil: new Date(Date.now() + 3600000).toISOString(),
    });

    mocks.getAntigravityUsage.mockResolvedValue({
      plan: "paid",
      quotas: {
        "gemini-3.7-flash-medium": { remainingPercentage: 0, resetAt: new Date(Date.now() + 7200000).toISOString() },
        gemini_weekly: { remainingPercentage: 0, resetAt: new Date(Date.now() + 7200000).toISOString() },
        "claude-sonnet-4-6": { remainingPercentage: 100, resetAt: new Date(Date.now() + 86400000).toISOString() },
        claude_gpt_weekly: { remainingPercentage: 100, resetAt: new Date(Date.now() + 86400000).toISOString() },
      },
    });

    await refreshAntigravityQuota(connId, "tok-2", {});

    // Stale account flag must go; the 0% Gemini family keeps its per-model locks.
    expect(mocks.updateProviderConnection).toHaveBeenCalledWith(
      connId,
      expect.objectContaining({
        testStatus: "active",
        lockedAllUntil: null,
      }),
    );
    const patch = mocks.updateProviderConnection.mock.calls[0][1];
    expect(patch["modelLock_gemini-3.7-flash-medium"] ?? patch.modelLocks?.["gemini-3.7-flash-medium"]).toBeUndefined();
  });
  it("does NOT reactivate permanently disabled accounts", async () => {
    const connId = "ag-disabled-1";
    mocks.getProviderConnectionById.mockResolvedValue({
      id: connId,
      provider: "antigravity",
      isActive: false,
      testStatus: "disabled",
      disabledReason: "invalid key",
    });

    mocks.getAntigravityUsage.mockResolvedValue({
      plan: "paid",
      quotas: {
        "gemini-3.8-flash-high": { remainingPercentage: 100, resetAt: new Date(Date.now() + 7200000).toISOString() },
      },
    });

    await refreshAntigravityQuota(connId, "tok-disabled", {});

    expect(mocks.updateProviderConnection).not.toHaveBeenCalled();
  });
});

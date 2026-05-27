import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock modules before importing code under test
vi.mock("@/lib/proxyPoolAccess", () => ({
  getCurrentProxyPools: vi.fn(),
  getCurrentProxyPoolById: vi.fn(),
  updateCurrentProxyPool: vi.fn(),
  createCurrentProxyPool: vi.fn(),
  deleteCurrentProxyPool: vi.fn(),
}));

vi.mock("@/lib/network/proxyTest", () => ({
  testProxyUrl: vi.fn(),
  testRelay: vi.fn(),
}));

vi.mock("@/lib/connectionAccess", () => ({
  getCurrentProxyPoolById: vi.fn(),
  getCurrentProviderConnections: vi.fn().mockResolvedValue([]),
  updateCurrentProviderConnection: vi.fn(),
}));

vi.mock("@/lib/settingsAccess", () => ({
  getCurrentSettings: vi.fn().mockResolvedValue({}),
  updateCurrentSettings: vi.fn(),
}));

vi.mock("@/lib/proxyGroupAccess", () => ({
  getCurrentProxyGroups: vi.fn().mockResolvedValue([]),
  getCurrentProxyGroupById: vi.fn(),
  createCurrentProxyGroup: vi.fn(),
  updateCurrentProxyGroup: vi.fn(),
  deleteCurrentProxyGroup: vi.fn(),
}));

import { getCurrentProxyPools, updateCurrentProxyPool } from "@/lib/proxyPoolAccess";
import { testProxyUrl, testRelay } from "@/lib/network/proxyTest";
import { getCurrentProxyPoolById } from "@/lib/connectionAccess";
import { getCurrentProxyGroupById } from "@/lib/proxyGroupAccess";

const mockGetCurrentProxyPools = vi.mocked(getCurrentProxyPools);
const mockUpdateCurrentProxyPool = vi.mocked(updateCurrentProxyPool);
const mockTestProxyUrl = vi.mocked(testProxyUrl);
const mockTestRelay = vi.mocked(testRelay);
const mockGetCurrentProxyPoolById = vi.mocked(getCurrentProxyPoolById);
const mockGetCurrentProxyGroupById = vi.mocked(getCurrentProxyGroupById);

function makePool(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `pool-${id}`,
    proxyUrl: `http://proxy-${id}.example.com:8080`,
    noProxy: "",
    type: "http",
    isActive: true,
    strictProxy: false,
    testStatus: "unknown",
    lastTestedAt: null,
    lastError: null,
    responseTimeMs: null,
    ...overrides,
  };
}

function makeGroup(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `group-${id}`,
    mode: "roundrobin",
    stickyLimit: 1,
    strictProxy: false,
    proxyPoolIds: [],
    isActive: true,
    ...overrides,
  };
}

describe("proxy health check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function loadHealthCheckModule() {
    return import("@/lib/network/proxyHealthCheck");
  }

  describe("runHealthCheckNow", () => {
    it("should test all active http pools and update status on success", async () => {
      const poolA = makePool("pool-a");
      const poolB = makePool("pool-b", { isActive: false });

      mockGetCurrentProxyPools.mockResolvedValue([poolA, poolB]);
      mockTestProxyUrl.mockResolvedValue({ ok: true, status: 200, elapsedMs: 150 });
      mockUpdateCurrentProxyPool.mockResolvedValue(null);

      const { runHealthCheckNow } = await loadHealthCheckModule();
      const { results } = await runHealthCheckNow();

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("pool-a");
      expect(results[0].testStatus).toBe("active");
      expect(results[0].responseTimeMs).toBe(150);

      expect(mockTestProxyUrl).toHaveBeenCalledWith({ proxyUrl: poolA.proxyUrl });
      expect(mockUpdateCurrentProxyPool).toHaveBeenCalledWith("pool-a", {
        testStatus: "active",
        lastTestedAt: expect.any(String),
        lastError: null,
        responseTimeMs: 150,
      });
    });

    it("should test relay pools using testRelay", async () => {
      const poolRelay = makePool("pool-relay", { type: "relay", proxyUrl: "https://relay.workers.dev" });

      mockGetCurrentProxyPools.mockResolvedValue([poolRelay]);
      mockTestRelay.mockResolvedValue({ ok: true, status: 200, elapsedMs: 300 });
      mockUpdateCurrentProxyPool.mockResolvedValue(null);

      const { runHealthCheckNow } = await loadHealthCheckModule();
      const { results } = await runHealthCheckNow();

      expect(results).toHaveLength(1);
      expect(results[0].testStatus).toBe("active");
      expect(results[0].responseTimeMs).toBe(300);

      expect(mockTestRelay).toHaveBeenCalledWith(poolRelay.proxyUrl);
    });

    it("should mark pool as error on test failure", async () => {
      const poolA = makePool("pool-a");

      mockGetCurrentProxyPools.mockResolvedValue([poolA]);
      mockTestProxyUrl.mockResolvedValue({ ok: false, status: 500, error: "Connection refused" });
      mockUpdateCurrentProxyPool.mockResolvedValue(null);

      const { runHealthCheckNow } = await loadHealthCheckModule();
      const { results } = await runHealthCheckNow();

      expect(results).toHaveLength(1);
      expect(results[0].testStatus).toBe("error");
      expect(results[0].error).toBe("Connection refused");
      expect(results[0].responseTimeMs).toBeNull();

      expect(mockUpdateCurrentProxyPool).toHaveBeenCalledWith("pool-a", {
        testStatus: "error",
        lastTestedAt: expect.any(String),
        lastError: "Connection refused",
        responseTimeMs: null,
      });
    });

    it("should track responseTimeMs as null when test throws without timing", async () => {
      const poolA = makePool("pool-a");

      mockGetCurrentProxyPools.mockResolvedValue([poolA]);
      mockTestProxyUrl.mockRejectedValue(new Error("Network failure"));
      mockUpdateCurrentProxyPool.mockResolvedValue(null);

      const { runHealthCheckNow } = await loadHealthCheckModule();
      const { results } = await runHealthCheckNow();

      expect(results).toHaveLength(1);
      expect(results[0].testStatus).toBe("error");
      expect(results[0].responseTimeMs).toBeNull();
    });

    it("should update lastHealthCheckAt after completion", async () => {
      mockGetCurrentProxyPools.mockResolvedValue([]);

      const { runHealthCheckNow, getLastHealthCheckAt } = await loadHealthCheckModule();

      expect(getLastHealthCheckAt()).toBeNull();
      await runHealthCheckNow();
      expect(getLastHealthCheckAt()).not.toBeNull();
    });
  });

  describe("startProxyHealthCheck / stopProxyHealthCheck", () => {
    it("should start and stop without errors", async () => {
      const { startProxyHealthCheck, stopProxyHealthCheck } = await loadHealthCheckModule();
      startProxyHealthCheck();
      stopProxyHealthCheck();
    });
  });
});

describe("group resolution skips error pools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function loadConnectionProxyModule() {
    return import("@/lib/network/connectionProxy");
  }

  it("should skip pools with testStatus=error in group resolution", async () => {
    const poolA = makePool("pool-a", { testStatus: "error" });
    const poolB = makePool("pool-b", { testStatus: "active" });
    const group = makeGroup("group-1", { proxyPoolIds: ["pool-a", "pool-b"] });

    mockGetCurrentProxyGroupById.mockResolvedValue(group);
    mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
      if (id === "pool-a") return poolA;
      if (id === "pool-b") return poolB;
      return null;
    });

    const { resolveProxyFromGroup } = await loadConnectionProxyModule();
    const result = await resolveProxyFromGroup("group-1", "test");

    expect(result?.proxyPoolId).toBe("pool-b");
  });

  it("should return direct (none) when all pools are error and strictProxy is false", async () => {
    const poolA = makePool("pool-a", { testStatus: "error" });
    const poolB = makePool("pool-b", { testStatus: "error" });
    const group = makeGroup("group-1", { proxyPoolIds: ["pool-a", "pool-b"], strictProxy: false });

    mockGetCurrentProxyGroupById.mockResolvedValue(group);
    mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
      if (id === "pool-a") return poolA;
      if (id === "pool-b") return poolB;
      return null;
    });

    const { resolveProxyFromGroup } = await loadConnectionProxyModule();
    const result = await resolveProxyFromGroup("group-1", "test");

    expect(result).not.toBeNull();
    expect(result?.connectionProxyEnabled).toBe(false);
    expect(result?.proxyPoolId).toBeNull();
  });

  it("should return null when all pools are error and strictProxy is true", async () => {
    const poolA = makePool("pool-a", { testStatus: "error" });
    const poolB = makePool("pool-b", { testStatus: "error" });
    const group = makeGroup("group-1", { proxyPoolIds: ["pool-a", "pool-b"], strictProxy: true });

    mockGetCurrentProxyGroupById.mockResolvedValue(group);
    mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
      if (id === "pool-a") return poolA;
      if (id === "pool-b") return poolB;
      return null;
    });

    const { resolveProxyFromGroup } = await loadConnectionProxyModule();
    const result = await resolveProxyFromGroup("group-1", "test");

    expect(result).toBeNull();
  });

  it("should still include pools with unknown testStatus (not explicitly error)", async () => {
    const poolA = makePool("pool-a", { testStatus: "unknown" });
    const poolB = makePool("pool-b", { testStatus: "error" });
    const group = makeGroup("group-1", { proxyPoolIds: ["pool-a", "pool-b"] });

    mockGetCurrentProxyGroupById.mockResolvedValue(group);
    mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
      if (id === "pool-a") return poolA;
      if (id === "pool-b") return poolB;
      return null;
    });

    const { resolveProxyFromGroup } = await loadConnectionProxyModule();
    const result = await resolveProxyFromGroup("group-1", "test");

    expect(result?.proxyPoolId).toBe("pool-a");
  });
});

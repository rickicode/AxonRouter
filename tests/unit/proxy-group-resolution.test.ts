import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock modules before importing code under test
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

import { getCurrentProxyPoolById } from "@/lib/connectionAccess";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { getCurrentProxyGroupById } from "@/lib/proxyGroupAccess";

const mockGetCurrentProxyPoolById = vi.mocked(getCurrentProxyPoolById);
const mockGetCurrentSettings = vi.mocked(getCurrentSettings);
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

describe("proxy group resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module to clear in-memory state (round-robin cursors, sticky state)
    vi.resetModules();
  });

  async function loadModule() {
    return import("@/lib/network/connectionProxy");
  }

  describe("round-robin rotation", () => {
    it("should rotate through active pools in order", async () => {
      const poolA = makePool("pool-a");
      const poolB = makePool("pool-b");
      const poolC = makePool("pool-c");
      const group = makeGroup("group-1", { proxyPoolIds: ["pool-a", "pool-b", "pool-c"] });

      mockGetCurrentProxyGroupById.mockResolvedValue(group);
      mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
        if (id === "pool-a") return poolA;
        if (id === "pool-b") return poolB;
        if (id === "pool-c") return poolC;
        return null;
      });

      const { resolveProxyFromGroup } = await loadModule();

      const result1 = await resolveProxyFromGroup("group-1", "test");
      expect(result1?.proxyPoolId).toBe("pool-a");

      const result2 = await resolveProxyFromGroup("group-1", "test");
      expect(result2?.proxyPoolId).toBe("pool-b");

      const result3 = await resolveProxyFromGroup("group-1", "test");
      expect(result3?.proxyPoolId).toBe("pool-c");

      // Wraps around
      const result4 = await resolveProxyFromGroup("group-1", "test");
      expect(result4?.proxyPoolId).toBe("pool-a");
    });

    it("should skip inactive pools in rotation", async () => {
      const poolA = makePool("pool-a");
      const poolB = makePool("pool-b", { isActive: false });
      const poolC = makePool("pool-c");
      const group = makeGroup("group-1", { proxyPoolIds: ["pool-a", "pool-b", "pool-c"] });

      mockGetCurrentProxyGroupById.mockResolvedValue(group);
      mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
        if (id === "pool-a") return poolA;
        if (id === "pool-b") return poolB;
        if (id === "pool-c") return poolC;
        return null;
      });

      const { resolveProxyFromGroup } = await loadModule();

      const result1 = await resolveProxyFromGroup("group-1", "test");
      expect(result1?.proxyPoolId).toBe("pool-a");

      const result2 = await resolveProxyFromGroup("group-1", "test");
      expect(result2?.proxyPoolId).toBe("pool-c");

      const result3 = await resolveProxyFromGroup("group-1", "test");
      expect(result3?.proxyPoolId).toBe("pool-a");
    });

    it("should return null for inactive group", async () => {
      const group = makeGroup("group-1", { isActive: false, proxyPoolIds: ["pool-a"] });
      mockGetCurrentProxyGroupById.mockResolvedValue(group);

      const { resolveProxyFromGroup } = await loadModule();
      const result = await resolveProxyFromGroup("group-1", "test");
      expect(result).toBeNull();
    });

    it("should return null for group with no active pools", async () => {
      const poolA = makePool("pool-a", { isActive: false });
      const group = makeGroup("group-1", { proxyPoolIds: ["pool-a"] });

      mockGetCurrentProxyGroupById.mockResolvedValue(group);
      mockGetCurrentProxyPoolById.mockResolvedValue(poolA);

      const { resolveProxyFromGroup } = await loadModule();
      const result = await resolveProxyFromGroup("group-1", "test");
      expect(result).toBeNull();
    });

    it("should return null for empty group", async () => {
      const group = makeGroup("group-1", { proxyPoolIds: [] });
      mockGetCurrentProxyGroupById.mockResolvedValue(group);

      const { resolveProxyFromGroup } = await loadModule();
      const result = await resolveProxyFromGroup("group-1", "test");
      expect(result).toBeNull();
    });
  });

  describe("sticky mode", () => {
    it("should stick to the same pool within stickyLimit", async () => {
      const poolA = makePool("pool-a");
      const poolB = makePool("pool-b");
      const group = makeGroup("group-1", {
        mode: "sticky",
        stickyLimit: 3,
        proxyPoolIds: ["pool-a", "pool-b"],
      });

      mockGetCurrentProxyGroupById.mockResolvedValue(group);
      mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
        if (id === "pool-a") return poolA;
        if (id === "pool-b") return poolB;
        return null;
      });

      const { resolveProxyFromGroup } = await loadModule();

      // First 3 calls stay on pool-a
      const r1 = await resolveProxyFromGroup("group-1", "test");
      expect(r1?.proxyPoolId).toBe("pool-a");

      const r2 = await resolveProxyFromGroup("group-1", "test");
      expect(r2?.proxyPoolId).toBe("pool-a");

      const r3 = await resolveProxyFromGroup("group-1", "test");
      expect(r3?.proxyPoolId).toBe("pool-a");

      // 4th call should rotate to pool-b
      const r4 = await resolveProxyFromGroup("group-1", "test");
      expect(r4?.proxyPoolId).toBe("pool-b");

      // Next 3 on pool-b
      const r5 = await resolveProxyFromGroup("group-1", "test");
      expect(r5?.proxyPoolId).toBe("pool-b");

      const r6 = await resolveProxyFromGroup("group-1", "test");
      expect(r6?.proxyPoolId).toBe("pool-b");

      // Rotate back to pool-a
      const r7 = await resolveProxyFromGroup("group-1", "test");
      expect(r7?.proxyPoolId).toBe("pool-a");
    });

    it("should rotate immediately if sticky pool becomes inactive", async () => {
      let poolAActive = true;
      const poolA = makePool("pool-a");
      const poolB = makePool("pool-b");
      const group = makeGroup("group-1", {
        mode: "sticky",
        stickyLimit: 5,
        proxyPoolIds: ["pool-a", "pool-b"],
      });

      mockGetCurrentProxyGroupById.mockResolvedValue(group);
      mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
        if (id === "pool-a") return poolAActive ? poolA : { ...poolA, isActive: false };
        if (id === "pool-b") return poolB;
        return null;
      });

      const { resolveProxyFromGroup } = await loadModule();

      const r1 = await resolveProxyFromGroup("group-1", "test");
      expect(r1?.proxyPoolId).toBe("pool-a");

      // Make pool-a inactive
      poolAActive = false;

      const r2 = await resolveProxyFromGroup("group-1", "test");
      expect(r2?.proxyPoolId).toBe("pool-b");
    });
  });

  describe("strictProxy behavior", () => {
    it("should set strictProxy from group when resolving via group", async () => {
      const poolA = makePool("pool-a", { strictProxy: false });
      const group = makeGroup("group-1", {
        strictProxy: true,
        proxyPoolIds: ["pool-a"],
      });

      mockGetCurrentProxyGroupById.mockResolvedValue(group);
      mockGetCurrentProxyPoolById.mockResolvedValue(poolA);

      const { resolveProxyFromGroup } = await loadModule();
      const result = await resolveProxyFromGroup("group-1", "test");
      expect(result?.strictProxy).toBe(true);
    });

    it("should not set strictProxy when group has strictProxy=false", async () => {
      const poolA = makePool("pool-a", { strictProxy: true });
      const group = makeGroup("group-1", {
        strictProxy: false,
        proxyPoolIds: ["pool-a"],
      });

      mockGetCurrentProxyGroupById.mockResolvedValue(group);
      mockGetCurrentProxyPoolById.mockResolvedValue(poolA);

      const { resolveProxyFromGroup } = await loadModule();
      const result = await resolveProxyFromGroup("group-1", "test");
      expect(result?.strictProxy).toBe(false);
    });
  });

  describe("resolution chain priority", () => {
    it("connection proxyGroupId takes highest priority", async () => {
      const poolA = makePool("pool-a");
      const group = makeGroup("group-1", { proxyPoolIds: ["pool-a"] });

      mockGetCurrentProxyGroupById.mockResolvedValue(group);
      mockGetCurrentProxyPoolById.mockResolvedValue(poolA);
      mockGetCurrentSettings.mockResolvedValue({
        providerProxyDefaults: {
          openai: { proxyPoolId: "pool-b" },
        },
      });

      const { resolveConnectionProxyConfig } = await loadModule();
      const result = await resolveConnectionProxyConfig(
        { proxyGroupId: "group-1", proxyPoolId: "pool-b" },
        "openai",
      );
      expect(result.source).toBe("connection-group");
      expect(result.proxyPoolId).toBe("pool-a");
    });

    it("connection proxyPoolId is second priority", async () => {
      const poolB = makePool("pool-b");

      mockGetCurrentProxyGroupById.mockResolvedValue(null);
      mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
        if (id === "pool-b") return poolB;
        return null;
      });
      mockGetCurrentSettings.mockResolvedValue({
        providerProxyDefaults: {
          openai: { proxyPoolId: "pool-c" },
        },
      });

      const { resolveConnectionProxyConfig } = await loadModule();
      const result = await resolveConnectionProxyConfig(
        { proxyPoolId: "pool-b" },
        "openai",
      );
      expect(result.source).toBe("connection-pool");
      expect(result.proxyPoolId).toBe("pool-b");
    });

    it("provider-default proxyGroupId is third priority", async () => {
      const poolA = makePool("pool-a");
      const group = makeGroup("group-2", { proxyPoolIds: ["pool-a"] });

      mockGetCurrentProxyGroupById.mockImplementation(async (id: string) => {
        if (id === "group-2") return group;
        return null;
      });
      mockGetCurrentProxyPoolById.mockResolvedValue(poolA);
      mockGetCurrentSettings.mockResolvedValue({
        providerProxyDefaults: {
          openai: { proxyGroupId: "group-2", proxyPoolId: "pool-b" },
        },
      });

      const { resolveConnectionProxyConfig } = await loadModule();
      const result = await resolveConnectionProxyConfig({}, "openai");
      expect(result.source).toBe("provider-default-group");
      expect(result.proxyPoolId).toBe("pool-a");
    });

    it("provider-default proxyPoolId is fourth priority", async () => {
      const poolC = makePool("pool-c");

      mockGetCurrentProxyGroupById.mockResolvedValue(null);
      mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
        if (id === "pool-c") return poolC;
        return null;
      });
      mockGetCurrentSettings.mockResolvedValue({
        providerProxyDefaults: {
          openai: { proxyPoolId: "pool-c" },
        },
      });

      const { resolveConnectionProxyConfig } = await loadModule();
      const result = await resolveConnectionProxyConfig({}, "openai");
      expect(result.source).toBe("provider-default-pool");
      expect(result.proxyPoolId).toBe("pool-c");
    });

    it("returns none when no proxy is configured", async () => {
      mockGetCurrentProxyGroupById.mockResolvedValue(null);
      mockGetCurrentProxyPoolById.mockResolvedValue(null);
      mockGetCurrentSettings.mockResolvedValue({});

      const { resolveConnectionProxyConfig } = await loadModule();
      const result = await resolveConnectionProxyConfig({}, "openai");
      expect(result.source).toBe("none");
      expect(result.connectionProxyEnabled).toBe(false);
    });

    it("falls through group to pool when group is inactive", async () => {
      const poolB = makePool("pool-b");
      const inactiveGroup = makeGroup("group-1", { isActive: false, proxyPoolIds: ["pool-a"] });

      mockGetCurrentProxyGroupById.mockResolvedValue(inactiveGroup);
      mockGetCurrentProxyPoolById.mockImplementation(async (id: string) => {
        if (id === "pool-b") return poolB;
        return null;
      });

      const { resolveConnectionProxyConfig } = await loadModule();
      const result = await resolveConnectionProxyConfig(
        { proxyGroupId: "group-1", proxyPoolId: "pool-b" },
        null,
      );
      expect(result.source).toBe("connection-pool");
      expect(result.proxyPoolId).toBe("pool-b");
    });
  });

  describe("relay proxy type", () => {
    it("should return relayUrl for relay pools in a group", async () => {
      const poolRelay = makePool("pool-relay", { type: "relay", proxyUrl: "https://relay.workers.dev" });
      const group = makeGroup("group-1", { proxyPoolIds: ["pool-relay"] });

      mockGetCurrentProxyGroupById.mockResolvedValue(group);
      mockGetCurrentProxyPoolById.mockResolvedValue(poolRelay);

      const { resolveProxyFromGroup } = await loadModule();
      const result = await resolveProxyFromGroup("group-1", "test");
      expect(result?.connectionProxyEnabled).toBe(false);
      expect(result?.relayUrl).toBe("https://relay.workers.dev");
    });
  });
});

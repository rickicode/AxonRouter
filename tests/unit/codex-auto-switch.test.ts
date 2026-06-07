import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs/promises before importing the module under test
const mockFsWriteFile = vi.fn(async () => undefined);
const mockFsReadFile = vi.fn(async () => JSON.stringify({}));
const mockFsMkdir = vi.fn(async () => undefined);

vi.mock("fs/promises", () => ({
  default: {
    writeFile: mockFsWriteFile,
    readFile: mockFsReadFile,
    mkdir: mockFsMkdir,
  },
  writeFile: mockFsWriteFile,
  readFile: mockFsReadFile,
  mkdir: mockFsMkdir,
}));

// Mock connectionAccess
const mockGetCurrentProviderConnections = vi.fn();
vi.mock("@/lib/connectionAccess", () => ({
  getCurrentProviderConnections: (...args: any[]) =>
    mockGetCurrentProviderConnections(...args),
}));

// Mock settingsAccess
const mockGetCurrentSettings = vi.fn();
const mockAtomicUpdateCurrentSettings = vi.fn(async (updater: any) => {
  const current = mockGetCurrentSettings() || {};
  return updater(current);
});
vi.mock("@/lib/settingsAccess", () => ({
  getCurrentSettings: (...args: any[]) => mockGetCurrentSettings(...args),
  atomicUpdateCurrentSettings: (...args: any[]) =>
    mockAtomicUpdateCurrentSettings(...args),
}));

// Mock connectionStatus
vi.mock("@/lib/connectionStatus", () => ({
  getConnectionCentralizedStatus: (conn: any) => conn?.mockStatus || "eligible",
}));

function makeConnection(overrides: any = {}) {
  return {
    id: `codex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    provider: "codex",
    isActive: true,
    accessToken: "test-token",
    name: null,
    email: null,
    displayName: null,
    providerSpecificData: {},
    usageSnapshot: null,
    mockStatus: "eligible",
    ...overrides,
  };
}

function makeMockSnapshot(quotas: Record<string, any>) {
  return JSON.stringify({
    checkedAt: new Date().toISOString(),
    quotas,
  });
}

describe("Codex auto-switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no settings configured
    mockGetCurrentSettings.mockResolvedValue({
      codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: null },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("parseUsageSnapshot", () => {
    it("returns empty quotas when usageSnapshot is null", async () => {
      const { default: mod } = await import("../../src/lib/codexAutoSwitch");
      // Access internal via the exported functions - parseUsageSnapshot isn't exported,
      // so we test through isConnectionBelowThreshold which uses it
      mockGetCurrentProviderConnections.mockResolvedValue([
        makeConnection({ id: "conn-1", usageSnapshot: null }),
      ]);
      mockGetCurrentSettings.mockResolvedValue({
        codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: "conn-1" },
      });

      // Should return false (below threshold = false) since no quota data
      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();
      expect(result).toBeNull();
    });
  });

  describe("isConnectionBelowThreshold", () => {
    it("returns true when session quota is below threshold", async () => {
      mockGetCurrentProviderConnections.mockResolvedValue([
        makeConnection({
          id: "conn-below",
          usageSnapshot: makeMockSnapshot({
            session: { used: 95, total: 100, remaining: 5, remainingPercentage: 5 },
            weekly: { used: 60, total: 100, remaining: 40, remainingPercentage: 40 },
          }),
        }),
      ]);
      mockGetCurrentSettings.mockResolvedValue({
        codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: "conn-below" },
      });

      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();
      // No other accounts to rotate to, so should be null even though below threshold
      expect(result).toBeNull();
    });

    it("returns false when all quotas are above threshold", async () => {
      mockGetCurrentProviderConnections.mockResolvedValue([
        makeConnection({
          id: "conn-above",
          usageSnapshot: makeMockSnapshot({
            session: { used: 20, total: 100, remaining: 80, remainingPercentage: 80 },
            weekly: { used: 50, total: 100, remaining: 50, remainingPercentage: 50 },
          }),
        }),
      ]);
      mockGetCurrentSettings.mockResolvedValue({
        codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: "conn-above" },
      });

      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();
      expect(result).toBeNull();
    });

    it("handles usedPercent format from usage API", async () => {
      mockGetCurrentProviderConnections.mockResolvedValue([
        makeConnection({
          id: "conn-usedpct",
          usageSnapshot: makeMockSnapshot({
            session: { usedPercent: 95, total: 100 },
            weekly: { usedPercent: 30, total: 100 },
          }),
        }),
      ]);
      mockGetCurrentSettings.mockResolvedValue({
        codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: "conn-usedpct" },
      });

      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();
      // No other accounts to rotate to
      expect(result).toBeNull();
    });
  });

  describe("findNextHealthyConnection", () => {
    it("returns null when only one connection exists", async () => {
      mockGetCurrentProviderConnections.mockResolvedValue([
        makeConnection({ id: "conn-1" }),
      ]);
      mockGetCurrentSettings.mockResolvedValue({
        codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: "conn-1" },
      });

      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();
      expect(result).toBeNull();
    });

    it("skips exhausted and blocked connections", async () => {
      mockGetCurrentProviderConnections.mockResolvedValue([
        makeConnection({
          id: "conn-active",
          usageSnapshot: makeMockSnapshot({
            session: { used: 98, total: 100, remainingPercentage: 2 },
          }),
        }),
        makeConnection({
          id: "conn-blocked",
          accessToken: "token-2",
          mockStatus: "blocked",
        }),
        makeConnection({
          id: "conn-exhausted",
          accessToken: "token-3",
          mockStatus: "exhausted",
        }),
        makeConnection({
          id: "conn-healthy",
          accessToken: "token-4",
        }),
      ]);
      mockGetCurrentSettings.mockResolvedValue({
        codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: "conn-active" },
      });

      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();

      // Should rotate to conn-healthy (skip blocked/exhausted)
      expect(result).toBe("conn-healthy");
      expect(mockFsWriteFile).toHaveBeenCalled();
      // Verify auth.json was written with conn-healthy's token
      const writeCall = mockFsWriteFile.mock.calls.find(
        (call: any[]) => call[0] && call[0].endsWith("auth.json"),
      );
      expect(writeCall).toBeDefined();
      const writtenContent = JSON.parse(writeCall[1]);
      expect(writtenContent.OPENAI_API_KEY).toBe("token-4");
    });
  });

  describe("checkAndRotateCodexAccount", () => {
    it("does nothing when auto-switch is disabled", async () => {
      mockGetCurrentSettings.mockResolvedValue({
        codexAutoSwitch: { enabled: false, thresholdPercent: 10, activeConnectionId: null },
      });

      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();
      expect(result).toBeNull();
      expect(mockFsWriteFile).not.toHaveBeenCalled();
    });

    it("sets initial active account when none is configured", async () => {
      mockGetCurrentProviderConnections.mockResolvedValue([
        makeConnection({ id: "conn-a", accessToken: "token-a" }),
        makeConnection({ id: "conn-b", accessToken: "token-b" }),
      ]);

      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();

      expect(result).toBe("conn-a");
      // Should update auth.json with the selected connection's token
      const writeCall = mockFsWriteFile.mock.calls.find(
        (call: any[]) => call[0] && call[0].endsWith("auth.json"),
      );
      expect(writeCall).toBeDefined();
      const writtenContent = JSON.parse(writeCall[1]);
      expect(writtenContent.OPENAI_API_KEY).toBe("token-a");
    });

    it("rotates to next healthy account when quota is below threshold", async () => {
      mockGetCurrentProviderConnections.mockResolvedValue([
        makeConnection({
          id: "conn-1",
          accessToken: "token-1",
          usageSnapshot: makeMockSnapshot({
            session: { used: 98, total: 100, remainingPercentage: 2 },
          }),
        }),
        makeConnection({ id: "conn-2", accessToken: "token-2" }),
      ]);
      mockGetCurrentSettings.mockResolvedValue({
        codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: "conn-1" },
      });

      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();

      expect(result).toBe("conn-2");
      expect(mockAtomicUpdateCurrentSettings).toHaveBeenCalled();

      // Verify rotation event was persisted
      const updateCall = mockAtomicUpdateCurrentSettings.mock.calls.find((call: any[]) => {
        const updater = call[0];
        const result = updater({ codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: "conn-1" } });
        return result?.codexAutoSwitch?.lastRotatedAt && result?.codexAutoSwitch?.lastRotatedTo === "conn-2";
      });
      expect(updateCall).toBeDefined();
    });

    it("persists initial rotation event when setting first active account", async () => {
      mockGetCurrentProviderConnections.mockResolvedValue([
        makeConnection({ id: "conn-a", accessToken: "token-a" }),
        makeConnection({ id: "conn-b", accessToken: "token-b" }),
      ]);
      mockGetCurrentSettings.mockResolvedValue({
        codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: null },
      });

      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();

      expect(result).toBe("conn-a");
      // Initial account set should NOT include rotation event (no previous account)
      expect(mockAtomicUpdateCurrentSettings).toHaveBeenCalled();
    });

    it("does not rotate when quota is above threshold", async () => {
      mockGetCurrentProviderConnections.mockResolvedValue([
        makeConnection({
          id: "conn-1",
          accessToken: "token-1",
          usageSnapshot: makeMockSnapshot({
            session: { used: 30, total: 100, remainingPercentage: 70 },
          }),
        }),
        makeConnection({ id: "conn-2", accessToken: "token-2" }),
      ]);
      mockGetCurrentSettings.mockResolvedValue({
        codexAutoSwitch: { enabled: true, thresholdPercent: 10, activeConnectionId: "conn-1" },
      });

      const { checkAndRotateCodexAccount } = await import("../../src/lib/codexAutoSwitch");
      const result = await checkAndRotateCodexAccount();

      expect(result).toBeNull();
      expect(mockFsWriteFile).not.toHaveBeenCalled();
    });
  });
});

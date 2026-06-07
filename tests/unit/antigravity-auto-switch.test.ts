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

// Module scope mockDb for Vitest hoisting
const mockDb = {
  data: {
    providerConnections: [] as any[],
  },
};

vi.mock("../../src/lib/localDb/core", () => ({
  getDb: async () => mockDb,
  withLocalDbMutex: async (fn: any) => fn(),
  safeRead: async () => {},
  persistCollectionEntityWrite: async () => {},
  peekDbCacheArray: () => null,
}));

function makeConnection(overrides: any = {}) {
  return {
    id: `antigravity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    provider: "antigravity",
    isActive: true,
    accessToken: "test-token",
    refreshToken: "test-refresh-token",
    expiresIn: 3600,
    name: null,
    email: "test@google.com",
    displayName: null,
    providerSpecificData: {},
    usageSnapshot: null,
    mockStatus: "eligible",
    ...overrides,
  };
}

describe("Antigravity auto-switch & token sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default settings
    mockGetCurrentSettings.mockResolvedValue({
      antigravityAutoSwitch: { enabled: true, activeConnectionId: null },
    });
    mockDb.data.providerConnections = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("setActiveAntigravityAccount writes credentials correctly", async () => {
    const { setActiveAntigravityAccount } = await import("../../src/lib/antigravityAutoSwitch");
    const conn = makeConnection({ id: "conn-1", accessToken: "new-access-token" });
    mockGetCurrentProviderConnections.mockResolvedValue([conn]);

    const success = await setActiveAntigravityAccount("conn-1");
    expect(success).toBe(true);
    expect(mockFsWriteFile).toHaveBeenCalled();
    
    const writtenContent = JSON.parse(mockFsWriteFile.mock.calls[0][1]);
    expect(writtenContent.token.access_token).toBe("new-access-token");
    expect(writtenContent.auth_method).toBe("consumer");
  });

  it("syncActiveCliTokens updates token file on database connection update", async () => {
    const { updateProviderConnection } = await import("../../src/lib/localDb/providers");
    
    const conn = makeConnection({ id: "conn-active", accessToken: "updated-token" });
    mockDb.data.providerConnections = [conn];

    // Mock settings and active connection to be "conn-active"
    mockGetCurrentSettings.mockResolvedValue({
      antigravityAutoSwitch: { enabled: true, activeConnectionId: "conn-active" },
    });
    mockGetCurrentProviderConnections.mockResolvedValue([conn]);
    
    // Call updateProviderConnection
    const result = await updateProviderConnection("conn-active", { accessToken: "updated-token" });
    expect(result).toBeDefined();

    // Verify it triggers a sync write to token file
    // Wait for the async syncActiveCliTokens Promise to resolve
    await new Promise((resolve) => setTimeout(resolve, 50));
    
    expect(mockFsWriteFile).toHaveBeenCalled();
    const writtenContent = JSON.parse(mockFsWriteFile.mock.calls[0][1]);
    expect(writtenContent.token.access_token).toBe("updated-token");
  });
});

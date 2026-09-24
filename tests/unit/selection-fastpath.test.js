import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(async () => []),
  getProviderConnectionById: vi.fn(async () => null),
  getBatchCooldowns: vi.fn(async () => ({ ids: new Set(), healthy: true })),
  getLkg: vi.fn(async () => null),
  setLkg: vi.fn(async () => true),
  delLkg: vi.fn(async () => true),
  getDeadCircuit: vi.fn(async () => 0),
  incrDeadCircuit: vi.fn(async () => 1),
  resetDeadCircuit: vi.fn(async () => true),
}));

vi.mock("@/lib/cache/client.js", () => ({
  setAccountCooldown: vi.fn(async () => true),
  isAccountInCooldown: vi.fn(async () => false),
  setModelCooldown: vi.fn(async () => true),
  isModelInCooldown: vi.fn(async () => false),
  getBatchCooldowns: mocks.getBatchCooldowns,
  getCachedConnections: vi.fn(async () => null),
  setCachedConnections: vi.fn(async () => {}),
  invalidateCachedConnections: vi.fn(async () => {}),
  getLkg: mocks.getLkg,
  setLkg: mocks.setLkg,
  delLkg: mocks.delLkg,
  getDeadCircuit: mocks.getDeadCircuit,
  incrDeadCircuit: mocks.incrDeadCircuit,
  resetDeadCircuit: mocks.resetDeadCircuit,
  incrSharedCounter: vi.fn(async () => 1),
  incrModelFailCount: vi.fn(async () => 0),
  resetModelFailCount: vi.fn(async () => true),
  getModelFailCounts: vi.fn(async () => ({})),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getProviderConnectionById: mocks.getProviderConnectionById,
  getBatchProviderQuotas: vi.fn(async () => []),
  getUsageSnapshotByConnectionId: vi.fn(async () => null),
  getSettings: vi.fn(async () => ({})),
  getProxyPools: vi.fn(async () => []),
  validateApiKey: vi.fn(async () => null),
  updateProviderConnection: vi.fn(async () => ({})),
}));

vi.mock("@/shared/constants/providers.js", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (p) => p,
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
  pickProxyPoolId: vi.fn(() => null),
}));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));
vi.mock("open-sse/services/usage/google.js", () => ({ getAntigravityUsage: vi.fn() }));
vi.mock("open-sse/services/usage/freebuff.js", () => ({
  getFreebuffQuotaCache: vi.fn(() => new Map()),
  handleFreebuffQuotaError: vi.fn(async () => null),
}));
vi.mock("open-sse/executors/freebuff.js", () => ({
  canonicalFreebuffModel: (m) => m,
  FreebuffExecutor: class {},
}));

const { getProviderCredentials } = await import("../../src/sse/services/auth.js");

const healthyRow = (id) => ({
  id, provider: "openai", name: `acc-${id}`, email: `${id}@x.test`,
  isActive: true, testStatus: "active",
  rateLimitedUntil: null, lockedAllUntil: null, modelLocks: {},
  lastError: null, providerSpecificData: {},
});

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations — reset stateful ones explicitly or
  // values leak across tests (e.g. a tripped circuit short-circuits later tests).
  mocks.getProviderConnections.mockResolvedValue([]);
  mocks.getProviderConnectionById.mockResolvedValue(null);
  mocks.getDeadCircuit.mockResolvedValue(0);
  mocks.getLkg.mockResolvedValue(null);
});

describe("selection fast paths (in-memory cache + PG)", () => {
  it("dead circuit short-circuits to fast 503 without scanning PG", async () => {
    mocks.getDeadCircuit.mockResolvedValue(3);
    const res = await getProviderCredentials("openai", null, "gpt-x");
    expect(res.allRateLimited).toBe(true);
    expect(res.lastErrorCode).toBe("PROVIDER_CIRCUIT_OPEN");
    expect(mocks.getProviderConnections).not.toHaveBeenCalled();
  });

  it("LKG hit returns the proven account without a window scan", async () => {
    mocks.getLkg.mockResolvedValue("c-good");
    mocks.getProviderConnectionById.mockResolvedValue(healthyRow("c-good"));
    const res = await getProviderCredentials("openai", null, "gpt-x");
    expect(res?.connectionId).toBe("c-good");
    expect(mocks.getProviderConnections).not.toHaveBeenCalled();
  });

  it("stale LKG (model-locked) falls through to the window scan", async () => {
    mocks.getLkg.mockResolvedValue("c-stale");
    mocks.getProviderConnectionById.mockResolvedValue({
      ...healthyRow("c-stale"),
      modelLocks: { "gpt-x": new Date(Date.now() + 3600e3).toISOString() },
    });
    mocks.getProviderConnections.mockResolvedValue([healthyRow("c-fresh")]);
    const res = await getProviderCredentials("openai", null, "gpt-x");
    expect(res?.connectionId).toBe("c-fresh");
    expect(mocks.getProviderConnections).toHaveBeenCalled();
  });

  it("excluded LKG is ignored", async () => {
    mocks.getLkg.mockResolvedValue("c-good");
    mocks.getProviderConnections.mockResolvedValue([healthyRow("c-fresh")]);
    const res = await getProviderCredentials("openai", new Set(["c-good"]), "gpt-x");
    expect(mocks.getProviderConnectionById).not.toHaveBeenCalled();
    expect(res?.connectionId).toBe("c-fresh");
  });

  it("empty fresh selection feeds the dead circuit; success resets it", async () => {
    // Window scan empty, but rows exist (all exhausted) → counts as exhaustion,
    // not misconfiguration.
    mocks.getProviderConnections
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([healthyRow("c-dead")]);
    await getProviderCredentials("openai", null, "gpt-x");
    expect(mocks.incrDeadCircuit).toHaveBeenCalledWith("openai", "gpt-x", expect.any(Number));

    mocks.getProviderConnections.mockResolvedValue([healthyRow("c-fresh")]);
    await getProviderCredentials("openai", null, "gpt-x");
    expect(mocks.resetDeadCircuit).toHaveBeenCalledWith("openai", "gpt-x");
  });
});

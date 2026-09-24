import { beforeEach, describe, expect, it, vi } from "vitest";

const MOCK_CONNECTIONS = [
  { id: "cline-free-conn-1", provider: "cline-free", isActive: true, testStatus: "active", data: {} },
  { id: "cline-free-conn-2", provider: "cline-free", isActive: true, testStatus: "active", data: {} },
];

let connectionUpdateCalls = [];

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: vi.fn(async () => null),
  getProviderConnections: vi.fn(async () => MOCK_CONNECTIONS),
  updateProviderConnection: vi.fn(async (...a) => {
    connectionUpdateCalls.push(a);
  }),
  getSettings: vi.fn(async () => ({})),
  getProxyPools: vi.fn(async () => []),
  getProviderNodes: vi.fn(async () => []),
}));

vi.mock("@/lib/cache/client.js", () => ({
  getCachedConnections: vi.fn(async () => null),
  setCachedConnections: vi.fn(async () => {}),
  getBatchCooldowns: vi.fn(async () => new Set()),
  setAccountCooldown: vi.fn(async () => true),
  setModelCooldown: vi.fn(async () => true),
  isAccountInCooldown: vi.fn(async () => false),
  isModelInCooldown: vi.fn(async () => false),
  invalidateCachedConnections: vi.fn(async () => {}),
  getLkg: vi.fn(async () => null),
  setLkg: vi.fn(async () => true),
  delLkg: vi.fn(async () => true),
  getDeadCircuit: vi.fn(async () => 0),
  incrDeadCircuit: vi.fn(async () => 1),
  resetDeadCircuit: vi.fn(async () => true),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({
    connectionProxyEnabled: false,
    connectionProxyUrl: "",
    connectionNoProxy: "",
    proxyPoolId: null,
  })),
  pickProxyPoolId: vi.fn(() => null),
}));

import { markAccountUnavailable } from "../../src/sse/services/auth.js";

beforeEach(() => {
  connectionUpdateCalls = [];
});

const lockPatch = () => connectionUpdateCalls[0]?.[1] || {};

describe("cline-free quota & exhaustion audit fix", () => {
  it("credits exhausted on paid model: locks ONLY the model, never the account", async () => {
    const errorText = JSON.stringify({
      error: { message: "credits exhausted", code: "insufficient_quota" },
    });
    await markAccountUnavailable("cline-free-conn-1", 402, errorText, "cline-free", "anthropic/claude-sonnet-4.6");

    expect(connectionUpdateCalls.length).toBe(1);
    const patch = lockPatch();

    // Must lock the specific model
    const lockKeys = Object.keys(patch).filter((k) => k.startsWith("modelLock_"));
    expect(lockKeys).toEqual(["modelLock_anthropic/claude-sonnet-4.6"]);

    // Account MUST NOT be marked exhausted or locked all
    expect(patch.testStatus).toBe("active");
    expect(patch.lockedAllUntil).toBeUndefined();
    expect(patch.modelLock___all).toBeUndefined();
  });

  it("transient 429 rate limit: 2-minute per-model throttle, never account-wide", async () => {
    const errorText = "rate limit exceeded: too many requests";
    await markAccountUnavailable("cline-free-conn-1", 429, errorText, "cline-free", "z-ai/glm-5.3-flash");

    expect(connectionUpdateCalls.length).toBe(1);
    const patch = lockPatch();

    // Must lock only the specific model for ~2 minutes
    const lockKeys = Object.keys(patch).filter((k) => k.startsWith("modelLock_"));
    expect(lockKeys).toEqual(["modelLock_z-ai/glm-5.3-flash"]);

    const diff = new Date(patch["modelLock_z-ai/glm-5.3-flash"]).getTime() - Date.now();
    expect(diff).toBeGreaterThan(115_000);
    expect(diff).toBeLessThan(125_000);

    // Account must remain active
    expect(patch.testStatus).toBe("active");
    expect(patch.lockedAllUntil).toBeUndefined();
  });

  it("daily free limit: locks all models on account for 24h as daily cap", async () => {
    const errorText = "daily free limit reached";
    await markAccountUnavailable("cline-free-conn-1", 429, errorText, "cline-free", "z-ai/glm-5.3-flash");

    expect(connectionUpdateCalls.length).toBe(1);
    const patch = lockPatch();

    // Account-wide lock applied
    expect(patch.lockedAllUntil).toBeDefined();
    const diff = new Date(patch.lockedAllUntil).getTime() - Date.now();
    expect(diff).toBeGreaterThan(23 * 3600 * 1000);
  });
});

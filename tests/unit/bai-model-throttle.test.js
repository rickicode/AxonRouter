import { beforeEach, describe, expect, it, vi } from "vitest";

const TPM_429 =
  "The request rate exceeds the current model TPM limit 10000000. Please reduce the request frequency or contact Tencent Cloud support to request a higher limit.";
const RPM_429 =
  "The request rate exceeds the current model RPM limit 1000. Please reduce the request frequency or contact Tencent Cloud support to request a higher limit.";
const CODE_429001 = "provider error code 429001: too many requests";

const MOCK_CONNECTIONS = [
  { id: "bai-conn-1", provider: "bai", isActive: true, testStatus: "active", data: {} },
  { id: "bai-conn-2", provider: "bai", isActive: true, testStatus: "active", data: {} },
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

describe("bai TPM/RPM 429 — 2-min per-model throttle", () => {
  it("TPM exceeds: per-model 2-min, never account-wide", async () => {
    await markAccountUnavailable("bai-conn-1", 429, TPM_429, "bai", "hy3", null, null);
    expect(connectionUpdateCalls.length).toBe(1);
    const patch = lockPatch();
    const lockKeys = Object.keys(patch).filter((k) => k.startsWith("modelLock_"));
    expect(lockKeys).toEqual(["modelLock_hy3"]);
    const diff = new Date(patch.modelLock_hy3).getTime() - Date.now();
    expect(diff).toBeGreaterThan(118_000);
    expect(diff).toBeLessThan(122_000);
    expect(patch.lockedAllUntil).toBeUndefined();
    expect(patch.testStatus).not.toBe("exhausted");
  });

  it("RPM exceeds: per-model 2-min cooldown", async () => {
    await markAccountUnavailable("bai-conn-1", 429, RPM_429, "bai", "qwen3.8-flash", null, null);
    const patch = lockPatch();
    expect(Object.keys(patch)).toContain("modelLock_qwen3.8-flash");
    const diff = new Date(patch["modelLock_qwen3.8-flash"]).getTime() - Date.now();
    expect(diff).toBeGreaterThan(118_000);
    expect(diff).toBeLessThan(122_000);
    expect(patch.lockedAllUntil).toBeUndefined();
  });

  it("code 429001 without TPM/RPM text: still 2-min model throttle", async () => {
    await markAccountUnavailable("bai-conn-1", 429, CODE_429001, "bai", "hy3", null, null);
    const patch = lockPatch();
    const diff = new Date(patch.modelLock_hy3).getTime() - Date.now();
    expect(diff).toBeGreaterThan(118_000);
    expect(diff).toBeLessThan(122_000);
  });

  it("same TPM text on non-bai provider: NOT the 2-min bai rule", async () => {
    await markAccountUnavailable("bai-conn-1", 429, TPM_429, "openai", "gpt-4o", null, null);
    const patch = lockPatch();
    const lockKeys = Object.keys(patch).filter((k) => k.startsWith("modelLock_"));
    const until = patch[lockKeys[0]];
    const diff = until ? new Date(until).getTime() - Date.now() : 0;
    // openai falls through to the 30-min default, not 2 minutes
    expect(diff).toBeGreaterThan(25 * 60 * 1000);
  });
});

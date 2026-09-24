import { beforeEach, describe, expect, it, vi } from "vitest";

// Exact shape from production: 403 with code 11140 but the body is a
// content-filter refusal ("request illegal" + safety review displayMsg),
// NOT a quota/credit problem.
const SAFETY_11140 =
  '[403 · workbuddy/deepseek-v4.1-flash]: {"code":11140,"msg":"request illegal",' +
  '"requestId":"c5cb0ed6-269c-46d5-bc55-45aa03be69d7","displayMsg":{' +
  '"en":"The content did not pass the safety review. Please adjust and retry.",' +
  '"zh":"内容未通过安全审核，请调整后重试.",' +
  '"zh-hant":"內容未通過安全審核，請調整後重試."}}';

// Genuine credit exhaustion on the same provider/code must keep the 7-day
// account-wide exhausted lock (existing behavior, must not regress).
const QUOTA_11140 =
  '[403 · workbuddy/deepseek-v4.1-flash]: {"code":11140,"msg":"insufficient_quota: credits exhausted"}';

const MOCK_CONNECTIONS = [
  { id: "wb-conn-1", provider: "workbuddy", isActive: true, testStatus: "active", data: {} },
  { id: "cb-conn-1", provider: "codebuddy-cn", isActive: true, testStatus: "active", data: {} },
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
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";

beforeEach(() => {
  connectionUpdateCalls = [];
});

describe("workbuddy/codebuddy 403 code 11140 — safety review is not quota exhaustion", () => {
  it("checkFallbackError classifies safety 11140 as no-lock, no-fallback", () => {
    const res = checkFallbackError(403, SAFETY_11140, 0);
    expect(res.shouldFallback).toBe(false);
    expect(res.cooldownMs).toBe(0);
    expect(res.isExhausted).toBe(false);
    expect(res.lockAll).toBe(false);
  });

  it("workbuddy safety 11140: no DB lock, no exhausted, no fallback", async () => {
    const res = await markAccountUnavailable(
      "wb-conn-1", 403, SAFETY_11140, "workbuddy", "workbuddy/deepseek-v4.1-flash", null, null,
    );
    expect(res.shouldFallback).toBe(false);
    expect(res.cooldownMs).toBe(0);
    // No routing state touched at all — the account stays usable.
    expect(connectionUpdateCalls.length).toBe(0);
  });

  it("codebuddy-cn safety 11140: no DB lock either", async () => {
    const res = await markAccountUnavailable(
      "cb-conn-1", 403, SAFETY_11140, "codebuddy-cn", "codebuddy-cn/deepseek-v4.1-flash", null, null,
    );
    expect(res.shouldFallback).toBe(false);
    expect(res.cooldownMs).toBe(0);
    expect(connectionUpdateCalls.length).toBe(0);
  });

  it("genuine insufficient_quota 11140 still locks account-wide 7d exhausted", async () => {
    const res = await markAccountUnavailable(
      "wb-conn-1", 403, QUOTA_11140, "workbuddy", "workbuddy/deepseek-v4.1-flash", null, null,
    );
    expect(res.shouldFallback).toBe(true);
    expect(connectionUpdateCalls.length).toBe(1);
    const patch = connectionUpdateCalls[0][1];
    expect(patch.testStatus).toBe("exhausted");
    expect(patch.lockedAllUntil).toBeTruthy();
    const diff = new Date(patch.lockedAllUntil).getTime() - Date.now();
    expect(diff).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
  });
});

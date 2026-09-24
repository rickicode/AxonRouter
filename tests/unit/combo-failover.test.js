import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(async () => ({ shouldFallback: true })),
  clearAccountError: vi.fn(async () => {}),
  handleChatCore: vi.fn(),
  getSettings: vi.fn(async () => ({})),
  checkAndRefreshToken: vi.fn(async (provider, creds) => creds),
  checkModelAvailability: vi.fn(async () => ({ available: true })),
  failCounts: {},
  incrCalls: [],
  resetCalls: [],
}));

vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: mocks.getProviderCredentials,
  markAccountUnavailable: mocks.markAccountUnavailable,
  clearAccountError: mocks.clearAccountError,
  extractApiKey: vi.fn(() => null),
  isValidApiKey: vi.fn(async () => true),
  checkModelAvailability: mocks.checkModelAvailability,
}));
vi.mock("@/sse/services/antigravityQuota.js", () => ({
  handleAntigravityQuotaError: vi.fn(async () => null),
  clearAntigravityStrikes: vi.fn(),
}));
vi.mock("open-sse/services/usage/freebuff.js", () => ({
  handleFreebuffQuotaError: vi.fn(async () => null),
}));
vi.mock("open-sse/executors/freebuff.js", () => ({
  canonicalFreebuffModel: (m) => m,
  FreebuffExecutor: class {},
}));
vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: vi.fn(async () => null),
  getSettings: mocks.getSettings,
  lockAccountToModel: vi.fn(),
  lockProxyPoolForScope: vi.fn(),
}));
vi.mock("@/lib/usageDb.js", () => ({
  saveFailedRequest: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
}));
vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: vi.fn(async (modelStr) => {
    if (!modelStr.includes("/")) return { provider: null };
    const [provider, ...rest] = modelStr.split("/");
    return { provider, model: rest.join("/") };
  }),
  getComboModels: vi.fn(async (modelStr) =>
    modelStr === "combo" ? ["uk/dead-model", "ag/good-model"] : null),
}));
vi.mock("open-sse/handlers/chatCore.js", () => ({
  handleChatCore: mocks.handleChatCore,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  updateProviderCredentials: vi.fn(async () => {}),
  checkAndRefreshToken: mocks.checkAndRefreshToken,
}));
vi.mock("open-sse/services/projectId.js", () => ({
  getProjectIdForConnection: vi.fn(async () => null),
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
}));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(),
  tagForSession: vi.fn(), nextTag: vi.fn(() => ""),
  maskKey: vi.fn((k) => k),
}));
vi.mock("@/lib/cache/client.js", () => ({
  incrModelFailCount: vi.fn(async (m) => { mocks.incrCalls.push(m); return 1; }),
  resetModelFailCount: vi.fn(async (m) => { mocks.resetCalls.push(m); return true; }),
  getModelFailCounts: vi.fn(async (members) => {
    const out = {};
    for (const m of members) out[m] = mocks.failCounts[m] || 0;
    return out;
  }),
  setLkg: vi.fn(async () => true),
  resetDeadCircuit: vi.fn(async () => true),
  getLkg: vi.fn(async () => null),
  delLkg: vi.fn(async () => true),
  getDeadCircuit: vi.fn(async () => 0),
  incrDeadCircuit: vi.fn(async () => 1),
  clearProviderDead: vi.fn(async () => true),
  setProviderDead: vi.fn(async () => true),
  isProviderDead: vi.fn(async () => false),
  incrSharedCounter: vi.fn(async () => 1),
}));

const { handleSingleModelChat } = await import("@/sse/handlers/chat.js");

const BODY = { model: "combo", messages: [{ role: "user", content: "hi" }] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.failCounts = {};
  mocks.incrCalls = [];
  mocks.resetCalls = [];
  mocks.checkModelAvailability.mockResolvedValue({ available: true });
  let n = 0;
  mocks.getProviderCredentials.mockImplementation(async () => ({
    connectionId: `c-${++n}`,
    connectionName: `acc-${n}`,
    providerSpecificData: {},
    testStatus: "active",
  }));
  mocks.getSettings.mockResolvedValue({});
});

describe("combo failover after 3 consecutive failures", () => {
  it("starts the next request at the healthy member", async () => {
    // Dead member hit the 3-failure threshold on previous requests.
    mocks.failCounts = { "uk/dead-model": 3 };
    const tried = [];
    mocks.handleChatCore.mockImplementation(async (opts) => {
      tried.push(`${opts.modelInfo.provider}/${opts.modelInfo.model}`);
      return { success: true, response: { status: 200 } };
    });

    const res = await handleSingleModelChat({ ...BODY }, "combo", null, null, null, null, false, { used: 0 });
    expect(res.status).toBe(200);
    // Healthy member first — dead member never touched this request.
    expect(tried).toEqual(["ag/good-model"]);
  });

  it("counts fallback failures and resets on success", async () => {
    // The real chatCore invokes onRequestSuccess on success; the mock must do
    // the same or the reset path is never exercised.
    mocks.handleChatCore
      .mockResolvedValueOnce({ success: false, status: 429, error: "quota exceeded" })
      .mockImplementationOnce(async (opts) => {
        await opts.onRequestSuccess?.();
        return { success: true, response: { status: 200 } };
      });
    const res = await handleSingleModelChat(
      { model: "p/m", messages: BODY.messages }, "p/m", null, null, null, null, false, { used: 0 });
    expect(res.status).toBe(200);
    expect(mocks.incrCalls).toEqual(["p/m"]);
    expect(mocks.resetCalls).toEqual(["p/m"]);
  });

  it("keeps original order when every member is failing", async () => {
    mocks.failCounts = { "uk/dead-model": 5, "ag/good-model": 9 };
    mocks.handleChatCore.mockResolvedValue({ success: true, response: { status: 200 } });
    const res = await handleSingleModelChat({ ...BODY }, "combo", null, null, null, null, false, { used: 0 });
    expect(res.status).toBe(200);
    expect(mocks.handleChatCore).toHaveBeenCalledTimes(1);
  });

  it("fast-skips exhausted member via checkModelAvailability probe without calling chatCore", async () => {
    mocks.checkModelAvailability.mockImplementation(async (provider, model) => {
      if (provider === "uk" && model === "dead-model") {
        return { available: false, code: "ACCOUNT_EXHAUSTED" };
      }
      return { available: true };
    });

    const tried = [];
    mocks.handleChatCore.mockImplementation(async (opts) => {
      tried.push(`${opts.modelInfo.provider}/${opts.modelInfo.model}`);
      return { success: true, response: { status: 200 } };
    });

    const res = await handleSingleModelChat({ ...BODY }, "combo", null, null, null, null, false, { used: 0 });
    expect(res.status).toBe(200);
    expect(tried).toEqual(["ag/good-model"]);
    expect(mocks.checkModelAvailability).toHaveBeenCalledWith("uk", "dead-model");
  });
});

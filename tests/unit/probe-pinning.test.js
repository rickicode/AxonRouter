import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(async () => ({ shouldFallback: true })),
  clearAccountError: vi.fn(async () => {}),
  handleChatCore: vi.fn(),
  getSettings: vi.fn(async () => ({})),
  checkAndRefreshToken: vi.fn(async (provider, creds) => creds),
}));

vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: mocks.getProviderCredentials,
  markAccountUnavailable: mocks.markAccountUnavailable,
  clearAccountError: mocks.clearAccountError,
  extractApiKey: vi.fn(() => null),
  isValidApiKey: vi.fn(async () => true),
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
  getComboModels: vi.fn(async () => null),
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
  incrModelFailCount: vi.fn(async () => 0),
  resetModelFailCount: vi.fn(async () => true),
  getModelFailCounts: vi.fn(async () => ({})),
  clearProviderDead: vi.fn(async () => true),
  isProviderDead: vi.fn(async () => false),
  incrSharedCounter: vi.fn(async () => 1),
  setLkg: vi.fn(async () => true),
  resetDeadCircuit: vi.fn(async () => true),
  getLkg: vi.fn(async () => null),
  delLkg: vi.fn(async () => true),
  getDeadCircuit: vi.fn(async () => 0),
  incrDeadCircuit: vi.fn(async () => 1),
}));

const { handleSingleModelChat } = await import("@/sse/handlers/chat.js");

const BODY = { model: "p/m", messages: [{ role: "user", content: "hi" }] };
const probeRequest = (headers = {}) => ({
  url: "http://x/api/v1/chat/completions",
  headers: {
    get: (k) => ({
      "x-axonrouter-test-request": "1",
      "x-connection-id": "c-probe",
      "x-connection-pin": "strict",
      ...headers,
    }[k.toLowerCase()] || null),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSettings.mockResolvedValue({});
  mocks.getProviderCredentials.mockImplementation(async () => ({
    connectionId: "c-probe",
    connectionName: "probe-acc",
    providerSpecificData: {},
    testStatus: "active",
  }));
});

describe("probe pinning + isolation", () => {
  it("strict-pin probe returns the pinned account's actual error untouched", async () => {
    mocks.handleChatCore.mockResolvedValue({ success: false, status: 429, error: "quota exceeded" });
    const res = await handleSingleModelChat({ ...BODY }, "p/m", null, probeRequest(), null, null, true, { used: 0 });
    expect(res.status).toBe(429);
    expect(await res.text()).toContain("quota exceeded");
    // No production state writes for the probe failure.
    expect(mocks.markAccountUnavailable).not.toHaveBeenCalled();
  });

  it("pinned miss is an honest error, never a sibling account", async () => {
    mocks.getProviderCredentials.mockResolvedValue({
      pinnedMiss: true,
      connectionId: "c-probe",
      lastError: "Pinned connection c-probe... is not currently routable",
    });
    const res = await handleSingleModelChat({ ...BODY }, "p/m", null, probeRequest(), null, null, true, { used: 0 });
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("c-probe");
    expect(mocks.handleChatCore).not.toHaveBeenCalled();
  });

  it("401-refresh retry reuses the refreshed account", async () => {
    const seen = [];
    mocks.getProviderCredentials.mockImplementation(async () => {
      seen.push("select");
      return { connectionId: "c-1", connectionName: "a", refreshToken: "rt",
        providerSpecificData: {}, testStatus: "active" };
    });
    mocks.handleChatCore
      .mockResolvedValueOnce({ success: false, status: 401, error: "expired" })
      .mockImplementationOnce(async (opts) => {
        await opts.onRequestSuccess?.();
        return { success: true, response: { status: 200 } };
      });
    // Pre-request check: nothing to refresh; forced 401 retry: fresh token.
    mocks.checkAndRefreshToken.mockImplementation(async (p, c, opts) =>
      opts?.force ? { accessToken: "fresh" } : c);
    const res = await handleSingleModelChat({ ...BODY }, "p/m", null, probeRequest({}), null, null, false, { used: 0 });
    expect(res.status).toBe(200);
    // Both selections pinned to the refreshed account (preferredConnectionId).
    const calls = mocks.getProviderCredentials.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[1][3]).toEqual(expect.objectContaining({ preferredConnectionId: "c-1" }));
  });
});

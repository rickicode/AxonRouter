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
  getModelInfo: vi.fn(async (modelStr) =>
    modelStr.includes("/") ? { provider: "p", model: "m" } : { provider: null }),
  getComboModels: vi.fn(async (modelStr) =>
    modelStr === "combo" ? ["p/a", "p/b"] : null),
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

const { handleSingleModelChat } = await import("@/sse/handlers/chat.js");

const BODY = { model: "p/m", messages: [{ role: "user", content: "hi" }] };

beforeEach(() => {
  vi.clearAllMocks();
  let n = 0;
  // Fresh account every selection so per-member exclusion never stops the loop;
  // only the shared budget may stop it.
  mocks.getProviderCredentials.mockImplementation(async () => ({
    connectionId: `c-${++n}`,
    connectionName: `acc-${n}`,
    providerSpecificData: {},
    testStatus: "active",
  }));
  mocks.handleChatCore.mockResolvedValue({
    success: false, status: 429, error: "quota exceeded",
  });
  mocks.getSettings.mockResolvedValue({});
});

describe("shared rotation budget", () => {
  it("stops a single model after 5 upstream attempts with 503", async () => {
    const res = await handleSingleModelChat({ ...BODY }, "p/m", null, null, null, null, false, { used: 0 });
    expect(mocks.handleChatCore).toHaveBeenCalledTimes(5);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("Max rotation attempts (5) reached");
  });

  it("caps combo members combined at 5 upstream attempts", async () => {
    const res = await handleSingleModelChat({ ...BODY, model: "combo" }, "combo", null, null, null, null, false, { used: 0 });
    expect(mocks.handleChatCore).toHaveBeenCalledTimes(5);
    expect(res.status).toBe(503);
  });

  it("does not consume budget when no credentials exist", async () => {
    mocks.getProviderCredentials.mockResolvedValue(null);
    const budget = { used: 0 };
    const res = await handleSingleModelChat({ ...BODY }, "p/m", null, null, null, null, false, budget);
    expect(mocks.handleChatCore).not.toHaveBeenCalled();
    expect(budget.used).toBe(0);
    expect(res.status).toBe(503);
  });
});

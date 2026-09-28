import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(async () => ({ shouldFallback: true })),
  clearAccountError: vi.fn(async () => {}),
  handleChatCore: vi.fn(),
  getSettings: vi.fn(async () => ({})),
  checkAndRefreshToken: vi.fn(async (provider, creds) => creds),
  checkModelAvailability: vi.fn(async () => ({ available: true })),
  handleDifficultyChat: vi.fn(async () => ({ ok: true, status: 200 })),
}));

vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: mocks.getProviderCredentials,
  markAccountUnavailable: mocks.markAccountUnavailable,
  clearAccountError: mocks.clearAccountError,
  extractApiKey: vi.fn(() => null),
  isValidApiKey: vi.fn(async () => true),
  checkModelAvailability: mocks.checkModelAvailability,
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
  getComboModels: vi.fn(async (modelStr) => (modelStr === "combo" ? ["ag/model-a"] : null)),
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
  incrModelFailCount: vi.fn(async () => 1),
  resetModelFailCount: vi.fn(async () => true),
  getModelFailCounts: vi.fn(async (members) => Object.fromEntries(members.map((m) => [m, 0]))),
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
// Difficulty path only: capture the tuning object chat.js hands to the engine.
vi.mock("open-sse/services/combo.js", () => ({
  handleComboChat: vi.fn(),
  handleFusionChat: vi.fn(),
  handleDifficultyChat: mocks.handleDifficultyChat,
  detectRequiredCapabilities: vi.fn(() => new Set()),
  resetComboRotation: vi.fn(),
}));
vi.mock("open-sse/services/capacityAdapter.js", () => ({
  augmentModelsWithCapacityAdapter: vi.fn((models) => models),
  withCapacityAdapterStripping: vi.fn((fn) => fn),
  getActiveAdapterStrategy: vi.fn(() => "fallback"),
}));

const { handleChat } = await import("@/sse/handlers/chat.js");

function chatRequest(model) {
  return new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }] }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handleDifficultyChat.mockResolvedValue({ ok: true, status: 200 });
});

describe("chat.js difficulty tuning carries the judge settings", () => {
  it("passes global judge settings when the combo has no override", async () => {
    mocks.getSettings.mockResolvedValue({
      requireApiKey: false,
      comboStrategy: "fallback",
      comboStrategies: {
        combo: { fallbackStrategy: "difficulty" },
      },
      judgeMode: "jev-only",
      jevModel: "jev-latest",
      jevProvider: "typesafe",
      jevApiKeys: { typesafe: "global-ts-key" },
      jevConfidenceThreshold: 0.85,
    });

    await handleChat(chatRequest("combo"));

    expect(mocks.handleDifficultyChat).toHaveBeenCalledTimes(1);
    const { tuning } = mocks.handleDifficultyChat.mock.calls[0][0];
    expect(tuning.judgeMode).toBe("jev-only");
    expect(tuning.jevModel).toBe("jev-latest");
    expect(tuning.jevProvider).toBe("typesafe");
    expect(tuning.jevApiKeys).toEqual({ typesafe: "global-ts-key" });
    expect(tuning.jevConfidenceThreshold).toBe(0.85);
  });

  it("lets a combo-level override win over the global settings", async () => {
    mocks.getSettings.mockResolvedValue({
      requireApiKey: false,
      comboStrategy: "fallback",
      comboStrategies: {
        combo: {
          fallbackStrategy: "difficulty",
          judgeMode: "llm-only",
          jevModel: "jev-1.13",
          jevProvider: "opencode",
          jevApiKeys: { opencode: "combo-oc-key" },
          jevConfidenceThreshold: 0.4,
        },
      },
      judgeMode: "two-layer",
      jevModel: "jev-latest",
      jevProvider: "typesafe",
      jevApiKeys: { typesafe: "global-ts-key" },
      jevConfidenceThreshold: 0.85,
    });

    await handleChat(chatRequest("combo"));

    expect(mocks.handleDifficultyChat).toHaveBeenCalledTimes(1);
    const { tuning } = mocks.handleDifficultyChat.mock.calls[0][0];
    expect(tuning.judgeMode).toBe("llm-only");
    expect(tuning.jevModel).toBe("jev-1.13");
    expect(tuning.jevProvider).toBe("opencode");
    expect(tuning.jevApiKeys).toEqual({ opencode: "combo-oc-key" });
    expect(tuning.jevConfidenceThreshold).toBe(0.4);
  });
});

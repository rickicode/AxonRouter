import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderCredentials = vi.fn();
const markAccountUnavailable = vi.fn();
const clearAccountError = vi.fn();
const extractApiKey = vi.fn(() => null);
const isValidApiKey = vi.fn(() => true);
const getSettings = vi.fn(async () => ({
  requireApiKey: false,
  ccFilterNaming: false,
  comboStrategies: {},
  comboStrategy: "priority",
  providerThinking: {},
}));
const getModelInfo = vi.fn();
const getComboModels = vi.fn(async () => null);
const getComboForModel = vi.fn(async () => null);
const handleChatCore = vi.fn();
const errorResponse = vi.fn((status, message) => ({ status, body: { error: { message } } }));
const unavailableResponse = vi.fn((status, message) => ({ status, body: { error: { message } } }));
const handleComboChat = vi.fn();
const handleBypassRequest = vi.fn(async () => null);
const detectFormatByEndpoint = vi.fn(() => "openai");
const updateProviderCredentials = vi.fn();
const checkAndRefreshToken = vi.fn(async (_provider, credentials) => credentials);
const getProjectIdForConnection = vi.fn();

vi.mock("@/lib/localDb", () => ({
  getSettings,
  getApiKeys: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/sse/services/auth.tsx", () => ({
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
  hasApiKeys: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../src/sse/services/model.ts", () => ({
  getModelInfo,
  getComboModels,
  getComboForModel,
}));

vi.mock("open-sse/handlers/chatCore.ts", () => ({
  handleChatCore,
}));

vi.mock("open-sse/utils/error.ts", () => ({
  errorResponse,
  unavailableResponse,
}));

vi.mock("open-sse/services/combo.tsx", () => ({
  handleComboChat,
}));

vi.mock("open-sse/utils/bypassHandler.ts", () => ({
  handleBypassRequest,
}));

vi.mock("open-sse/config/runtimeConfig.ts", () => ({
  HTTP_STATUS: {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    RATE_LIMITED: 429,
    SERVICE_UNAVAILABLE: 503,
  },
}));

vi.mock("open-sse/translator/formats.ts", () => ({
  detectFormatByEndpoint,
}));

vi.mock("../../src/sse/services/tokenRefresh.tsx", () => ({
  updateProviderCredentials,
  checkAndRefreshToken,
}));

vi.mock("open-sse/services/projectId.ts", () => ({
  getProjectIdForConnection,
}));

vi.mock("open-sse/utils/claudeHeaderCache.ts", () => ({
  cacheClaudeHeaders: vi.fn(),
}));

vi.mock("open-sse/index.ts", () => ({}));
vi.mock("../../src/sse/utils/logger.ts", () => ({
  request: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  maskKey: vi.fn(() => "masked"),
}));

describe("chat model routing", () => {
  beforeEach(() => {
    vi.resetModules();
    getProviderCredentials.mockReset();
    markAccountUnavailable.mockReset();
    clearAccountError.mockReset();
    extractApiKey.mockReset();
    isValidApiKey.mockReset();
    getSettings.mockReset();
    getModelInfo.mockReset();
    getComboModels.mockReset();
    getComboForModel.mockReset();
    handleChatCore.mockReset();
    errorResponse.mockClear();
    unavailableResponse.mockClear();
    handleComboChat.mockReset();
    handleBypassRequest.mockReset();
    detectFormatByEndpoint.mockReset();
    updateProviderCredentials.mockReset();
    checkAndRefreshToken.mockReset();
    getProjectIdForConnection.mockReset();

    extractApiKey.mockReturnValue(null);
    isValidApiKey.mockResolvedValue(true);
    getSettings.mockResolvedValue({
      requireApiKey: false,
      ccFilterNaming: false,
      comboStrategies: {},
      comboStrategy: "priority",
      providerThinking: {},
    });
    getComboModels.mockResolvedValue(null);
    getComboForModel.mockResolvedValue(null);
    handleBypassRequest.mockResolvedValue(null);
    detectFormatByEndpoint.mockReturnValue("openai");
    checkAndRefreshToken.mockImplementation(async (_provider, credentials) => credentials);
    markAccountUnavailable.mockResolvedValue({ shouldFallback: false });
  });

  function makeRequest(model) {
    return {
      url: "http://localhost/v1/chat/completions",
      json: async () => ({ model, messages: [{ role: "user", content: "hi" }] }),
      headers: {
        get(name) {
          if (name.toLowerCase() === "user-agent") return "vitest";
          if (name.toLowerCase() === "authorization") return null;
          return null;
        },
        entries() {
          return [];
        },
      },
    };
  }

  it("prefers codex first for bare gpt model when codex has the same model", async () => {
    getModelInfo.mockResolvedValue({ provider: "openai", model: "gpt-5.4" });
    getProviderCredentials.mockResolvedValue({ connectionId: "codex-1", connectionName: "Codex", accessToken: "token" });
    handleChatCore.mockResolvedValue({ success: true, response: { status: 200, body: { ok: true } } });

    const { handleChat } = await import("../../src/sse/handlers/chat.ts");
    const response = await handleChat(makeRequest("gpt-5.4"));

    expect(getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(getProviderCredentials).toHaveBeenCalledWith("codex", expect.any(Set), "gpt-5.4", null, null);
    expect(handleChatCore).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ model: "codex/gpt-5.4" }),
      modelInfo: { provider: "codex", model: "gpt-5.4" },
    }));
    expect(response).toEqual({ status: 200, body: { ok: true } });
  });

  it("falls back to openai when codex-first bare gpt model has no codex credentials", async () => {
    getModelInfo.mockResolvedValue({ provider: "openai", model: "gpt-5.4" });
    getProviderCredentials
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ connectionId: "openai-1", connectionName: "OpenAI", accessToken: "token" });
    handleChatCore.mockResolvedValue({ success: true, response: { status: 200, body: { ok: true } } });

    const { handleChat } = await import("../../src/sse/handlers/chat.ts");
    await handleChat(makeRequest("gpt-5.4"));

    expect(getProviderCredentials).toHaveBeenNthCalledWith(1, "codex", expect.any(Set), "gpt-5.4", null, null);
    expect(getProviderCredentials).toHaveBeenNthCalledWith(2, "openai", expect.any(Set), "gpt-5.4", null, null);
    expect(handleChatCore).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ model: "openai/gpt-5.4" }),
      modelInfo: { provider: "openai", model: "gpt-5.4" },
    }));
  });

  it("keeps bare openai-family models on openai when codex lacks the same model", async () => {
    getModelInfo.mockResolvedValue({ provider: "openai", model: "gpt-4o-mini" });
    getProviderCredentials.mockResolvedValue({ connectionId: "openai-1", connectionName: "OpenAI", accessToken: "token" });
    handleChatCore.mockResolvedValue({ success: true, response: { status: 200, body: { ok: true } } });

    const { handleChat } = await import("../../src/sse/handlers/chat.ts");
    await handleChat(makeRequest("gpt-4o-mini"));

    expect(getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(getProviderCredentials).toHaveBeenCalledWith("openai", expect.any(Set), "gpt-4o-mini", null, null);
    expect(handleChatCore).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ model: "openai/gpt-4o-mini" }),
      modelInfo: { provider: "openai", model: "gpt-4o-mini" },
    }));
  });

  it("does not retry codex for bare openai-family models missing from codex", async () => {
    getModelInfo.mockResolvedValue({ provider: "openai", model: "gpt-4o-mini" });
    getProviderCredentials.mockResolvedValue(null);

    const { handleChat } = await import("../../src/sse/handlers/chat.ts");
    const response = await handleChat(makeRequest("gpt-4o-mini"));

    expect(getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(getProviderCredentials).toHaveBeenCalledWith("openai", expect.any(Set), "gpt-4o-mini", null, null);
    expect(errorResponse).toHaveBeenCalledWith(404, "No active credentials for provider: openai");
    expect(response).toEqual({ status: 404, body: { error: { message: "No active credentials for provider: openai" } } });
  });

  it("does not fall back explicit openai-prefixed requests to codex", async () => {
    getModelInfo.mockResolvedValue({ provider: "openai", model: "gpt-5.4" });
    getProviderCredentials.mockResolvedValue(null);

    const { handleChat } = await import("../../src/sse/handlers/chat.ts");
    const response = await handleChat(makeRequest("openai/gpt-5.4"));

    expect(getProviderCredentials).toHaveBeenCalledTimes(1);
    expect(getProviderCredentials).toHaveBeenCalledWith("openai", expect.any(Set), "gpt-5.4", null, null);
    expect(errorResponse).toHaveBeenCalledWith(404, "No active credentials for provider: openai");
    expect(response).toEqual({ status: 404, body: { error: { message: "No active credentials for provider: openai" } } });
  });

  it("lets routing strategy override the stored combo strategy", async () => {
    getSettings.mockResolvedValue({
      requireApiKey: false,
      ccFilterNaming: false,
      routing: { comboStrategy: "round-robin", stickyLimit: 2 },
      comboStrategy: "priority",
      providerThinking: {},
    });
    getComboModels.mockResolvedValue({
      id: "combo-1",
      name: "research",
      strategy: "priority",
      models: [{ kind: "model", model: "openai/gpt-4.1" }],
    });
    handleComboChat.mockResolvedValue({ status: 200, body: { ok: true } });

    const { handleChat } = await import("../../src/sse/handlers/chat.ts");
    await handleChat(makeRequest("mapped-model"));

    expect(handleComboChat).toHaveBeenCalledWith(expect.objectContaining({
      comboStrategy: "round-robin",
      comboStickyLimit: 2,
      combo: expect.objectContaining({ strategy: "round-robin" }),
    }));
  });

  it("returns 429 after two failed account attempts so clients can retry manually", async () => {
    getModelInfo.mockResolvedValue({ provider: "openai", model: "gpt-5.4" });
    getProviderCredentials
      .mockResolvedValueOnce({ connectionId: "conn-1", connectionName: "Conn 1", accessToken: "token-1" })
      .mockResolvedValueOnce({ connectionId: "conn-2", connectionName: "Conn 2", accessToken: "token-2" });
    handleChatCore
      .mockResolvedValueOnce({ success: false, status: 504, error: "timeout 1", response: { status: 504 } })
      .mockResolvedValueOnce({ success: false, status: 504, error: "timeout 2", response: { status: 504 } });
    markAccountUnavailable
      .mockResolvedValueOnce({ shouldFallback: true })
      .mockResolvedValueOnce({ shouldFallback: true });

    const { handleChat } = await import("../../src/sse/handlers/chat.ts");
    const response = await handleChat(makeRequest("gpt-5.4"));

    expect(handleChatCore).toHaveBeenCalledTimes(2);
    expect(markAccountUnavailable).toHaveBeenCalledTimes(2);
    expect(errorResponse).toHaveBeenCalledWith(429, "timeout 2");
    expect(response).toEqual({ status: 429, body: { error: { message: "timeout 2" } } });
  });
});

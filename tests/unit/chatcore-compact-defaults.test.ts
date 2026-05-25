import { describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const createRequestLoggerMock = vi.fn(async () => ({
  logClientRawRequest: vi.fn(),
  logRawRequest: vi.fn(),
  logTargetRequest: vi.fn(),
  logProviderResponse: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../open-sse/executors/index.ts", () => ({
  getExecutor: vi.fn(() => ({
    execute: executeMock,
    noAuth: false,
  })),
}));

vi.mock("../../open-sse/runtime/usagePersistence.ts", () => ({
  appendRequestLog: vi.fn().mockResolvedValue(undefined),
  saveRequestDetail: vi.fn().mockResolvedValue(undefined),
  trackPendingRequest: vi.fn(),
}));

vi.mock("../../open-sse/services/provider.ts", () => ({
  detectFormat: vi.fn(() => "openai"),
  getTargetFormat: vi.fn(() => "openai-responses"),
}));

vi.mock("../../open-sse/services/tokenRefresh.ts", () => ({
  refreshWithRetry: vi.fn(),
}));

vi.mock("../../open-sse/translator/index.ts", () => ({
  translateRequest: vi.fn(async (_sourceFormat, _targetFormat, model, body) => ({
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: body.messages?.[0]?.content || "hi" }] }],
    model,
  })),
}));

vi.mock("../../open-sse/utils/bypassHandler.ts", () => ({
  handleBypassRequest: vi.fn(async () => null),
}));

vi.mock("../../open-sse/utils/error.ts", () => ({
  createErrorResult: vi.fn((status, message) => ({ success: false, status, error: message })),
  formatProviderError: vi.fn((error) => error.message),
  parseUpstreamError: vi.fn(),
}));

vi.mock("../../open-sse/utils/requestLogger.tsx", () => ({
  createRequestLogger: createRequestLoggerMock,
}));

vi.mock("../../open-sse/utils/stream.tsx", () => ({
  COLORS: { red: "", reset: "" },
}));

vi.mock("../../open-sse/utils/streamHandler.ts", () => ({
  createStreamController: vi.fn(() => ({
    signal: undefined,
    handleComplete: vi.fn(),
    handleError: vi.fn(),
  })),
}));

vi.mock("../../open-sse/handlers/chatCore/nonStreamingHandler.ts", () => ({
  handleNonStreamingResponse: vi.fn(async () => ({
    success: true,
    response: new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    }),
  })),
}));

vi.mock("../../open-sse/handlers/chatCore/requestDetail.ts", () => ({
  buildRequestDetail: vi.fn(() => ({})),
  extractRequestConfig: vi.fn(() => ({})),
  stripInternalMetadata: vi.fn((value) => value),
}));

vi.mock("../../open-sse/handlers/chatCore/sseToJsonHandler.ts", () => ({
  handleForcedSSEToJson: vi.fn(async () => ({
    success: true,
    response: new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    }),
  })),
}));

vi.mock("../../open-sse/handlers/chatCore/streamingHandler.ts", () => ({
  buildOnStreamComplete: vi.fn(() => ({ onStreamComplete: vi.fn() })),
  handleStreamingResponse: vi.fn(async () => ({
    success: true,
    response: new Response("stream"),
  })),
}));

vi.mock("../../open-sse/config/providerModels.ts", () => ({
  getModelStrip: vi.fn(() => []),
  getModelTargetFormat: vi.fn(() => null),
  PROVIDER_ID_TO_ALIAS: {},
}));

vi.mock("../../open-sse/config/runtimeConfig.ts", () => ({
  HTTP_STATUS: {
    BAD_REQUEST: 400,
    BAD_GATEWAY: 502,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    GATEWAY_TIMEOUT: 504,
  },
}));

vi.mock("../../open-sse/translator/formats.ts", () => ({
  FORMATS: {
    ANTIGRAVITY: "antigravity",
    GEMINI: "gemini",
    GEMINI_CLI: "gemini-cli",
  },
}));

vi.mock("../../open-sse/utils/clientDetector.ts", () => ({
  detectClientTool: vi.fn(() => null),
  isNativePassthrough: vi.fn(() => false),
}));

const { handleChatCore } = await import("../../open-sse/handlers/chatCore.ts");

describe("chatCore compact defaults", () => {
  it("keeps chat completions non-compact by default for codex", async () => {
    executeMock.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
      url: "https://codex.test/responses",
      headers: {},
      transformedBody: { input: [] },
    });

    await handleChatCore({
      body: {
        model: "codex/gpt-5.4",
        messages: [{ role: "user", content: "reply with exactly pong" }],
        stream: false,
      },
      modelInfo: { provider: "codex", model: "gpt-5.4" },
      credentials: { connectionId: "conn-1", accessToken: "token", providerSpecificData: {} },
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
      clientRawRequest: {
        endpoint: "/v1/chat/completions",
        body: {},
        headers: { accept: "application/json" },
      },
      connectionId: "conn-1",
      sourceFormatOverride: "openai",
    });

    const args = executeMock.mock.calls[0][0];
    expect(args.stream).toBe(false);
    expect(args.body._compact).toBeUndefined();
  });

  it("enables compact when chat completions explicitly set use_compact=true", async () => {
    executeMock.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
      url: "https://codex.test/compact",
      headers: {},
      transformedBody: { input: [], _compact: true },
    });

    await handleChatCore({
      body: {
        model: "codex/gpt-5.4",
        messages: [{ role: "user", content: "reply with exactly pong" }],
        stream: false,
        use_compact: true,
      },
      modelInfo: { provider: "codex", model: "gpt-5.4" },
      credentials: { connectionId: "conn-2", accessToken: "token", providerSpecificData: {} },
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
      clientRawRequest: {
        endpoint: "/v1/chat/completions",
        body: {},
        headers: { accept: "application/json" },
      },
      connectionId: "conn-2",
      sourceFormatOverride: "openai",
    });

    const args = executeMock.mock.calls[1][0];
    expect(args.stream).toBe(false);
    expect(args.body._compact).toBe(true);
  });
});

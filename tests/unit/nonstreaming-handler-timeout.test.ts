import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/usageDb.ts", () => ({
  saveRequestDetail: vi.fn().mockResolvedValue(undefined),
  appendRequestLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../open-sse/handlers/chatCore/requestDetail.ts", async () => {
  const actual = await vi.importActual("../../open-sse/handlers/chatCore/requestDetail.ts");
  return {
    ...actual,
    saveUsageStats: vi.fn(),
    extractUsageFromResponse: vi.fn(() => ({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 })),
  };
});

const { handleNonStreamingResponse } = await import("../../open-sse/handlers/chatCore/nonStreamingHandler.ts");
const { setChatRuntimeSettings } = await import("../../open-sse/utils/abort.ts");

describe("handleNonStreamingResponse progress-aware SSE timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    setChatRuntimeSettings({});
  });

  it("keeps reading SSE while chunks are still arriving", async () => {
    vi.useFakeTimers();
    setChatRuntimeSettings({ codexNonCompactTimeoutMs: 20, codexAgenticTimeoutMs: 20 });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hel"}}]}\n\n'));
        }, 5);
        setTimeout(() => {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }, 10);
      },
    });

    const resultPromise = handleNonStreamingResponse({
      providerResponse: new Response(stream, { headers: { "content-type": "text/event-stream" } }),
      provider: "openai",
      model: "gpt-5.4",
      sourceFormat: "openai",
      targetFormat: "openai",
      body: { stream: false },
      stream: false,
      translatedBody: { stream: true },
      finalBody: null,
      requestStartTime: Date.now(),
      connectionId: "conn-1",
      apiKey: "key-1",
      clientRawRequest: { endpoint: "/v1/chat/completions" },
      onRequestSuccess: vi.fn(),
      reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn() },
      toolNameMap: null,
      trackDone: vi.fn(),
      appendLog: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(25);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    await expect(result.response.json()).resolves.toMatchObject({
      choices: [{ message: { content: "hello" } }],
    });
  });

});

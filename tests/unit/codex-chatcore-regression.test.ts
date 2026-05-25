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
  };
});

const { handleForcedSSEToJson } = await import("../../open-sse/handlers/chatCore/sseToJsonHandler.ts");

describe("codex chatCore regressions", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("converts Codex Responses-style SSE into chat.completion JSON even when content-type is application/json", async () => {
    const rawSSE = [
      'event: response.created',
      'data: {"response":{"id":"resp_test","created_at":1778119554}}',
      '',
      'event: response.output_item.done',
      'data: {"output_index":0,"item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"pong"}]}}',
      '',
      'event: response.completed',
      'data: {"response":{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"pong"}]}],"usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}}',
      '',
    ].join("\n");

    const providerResponse = new Response(rawSSE, {
      headers: { "content-type": "application/json" },
    });

    const result = await handleForcedSSEToJson({
      providerResponse,
      sourceFormat: "openai",
      provider: "codex",
      model: "gpt-5.4",
      body: { stream: false },
      stream: false,
      translatedBody: { stream: true },
      finalBody: null,
      requestStartTime: Date.now(),
      connectionId: "conn-codex-1",
      apiKey: "key-1",
      clientRawRequest: { endpoint: "/v1/chat/completions" },
      onRequestSuccess: vi.fn(),
      trackDone: vi.fn(),
      appendLog: vi.fn(),
    });

    expect(result.success).toBe(true);
    expect(result.response.headers.get("content-type")).toContain("application/json");
    await expect(result.response.json()).resolves.toEqual({
      id: "resp_test",
      object: "chat.completion",
      created: 1778119554,
      model: "gpt-5.4",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "pong" },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });
  });

  it("keeps OpenAI Responses clients on raw response objects instead of chat.completion translation", async () => {
    const rawSSE = [
      'event: response.created',
      'data: {"response":{"id":"resp_raw","created_at":1778119555}}',
      '',
      'event: response.completed',
      'data: {"response":{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"pong"}]}],"usage":{"input_tokens":9,"output_tokens":5,"total_tokens":14}}}',
      '',
    ].join("\n");

    const providerResponse = new Response(rawSSE, {
      headers: { "content-type": "application/json" },
    });

    const result = await handleForcedSSEToJson({
      providerResponse,
      sourceFormat: "openai-responses",
      provider: "codex",
      model: "gpt-5.4",
      body: { stream: false },
      stream: false,
      translatedBody: { stream: true },
      finalBody: null,
      requestStartTime: Date.now(),
      connectionId: "conn-codex-2",
      apiKey: "key-2",
      clientRawRequest: { endpoint: "/v1/responses" },
      onRequestSuccess: vi.fn(),
      trackDone: vi.fn(),
      appendLog: vi.fn(),
    });

    expect(result.success).toBe(true);
    await expect(result.response.json()).resolves.toMatchObject({
      id: "resp_raw",
      object: "response",
      output: [
        {
          type: "message",
          role: "assistant",
        },
      ],
      usage: {
        input_tokens: 9,
        output_tokens: 5,
        total_tokens: 14,
      },
    });
  });

  it("accepts real JSON Codex responses without misclassifying them as SSE", async () => {
    const providerResponse = new Response(JSON.stringify({
      id: "resp_json",
      object: "response",
      created_at: 1778119556,
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "pong" }],
        },
      ],
      usage: {
        input_tokens: 7,
        output_tokens: 5,
        total_tokens: 12,
      },
    }), {
      headers: { "content-type": "application/json" },
    });

    const result = await handleForcedSSEToJson({
      providerResponse,
      sourceFormat: "openai",
      provider: "codex",
      model: "gpt-5.4",
      body: { stream: false },
      stream: false,
      translatedBody: { stream: true },
      finalBody: null,
      requestStartTime: Date.now(),
      connectionId: "conn-codex-3",
      apiKey: "key-3",
      clientRawRequest: { endpoint: "/v1/chat/completions" },
      onRequestSuccess: vi.fn(),
      trackDone: vi.fn(),
      appendLog: vi.fn(),
    });

    expect(result.success).toBe(true);
    await expect(result.response.json()).resolves.toEqual({
      id: "resp_json",
      object: "chat.completion",
      created: 1778119556,
      model: "gpt-5.4",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "pong" },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: 7,
        completion_tokens: 5,
        total_tokens: 12,
      },
    });
  });

  it("keeps buffered Codex SSE alive while chunks are still arriving", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(encoder.encode('event: response.created\ndata: {"response":{"id":"resp_progress","created_at":1778119557}}\n\n'));
        }, 5);
        setTimeout(() => {
          controller.enqueue(encoder.encode('event: response.completed\ndata: {"response":{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"pong"}]}],"usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}}\n\n'));
          controller.close();
        }, 10);
      },
    });

    const providerResponse = new Response(stream, {
      headers: { "content-type": "text/event-stream" },
    });

    const resultPromise = handleForcedSSEToJson({
      providerResponse,
      sourceFormat: "openai",
      provider: "codex",
      model: "gpt-5.4",
      body: { stream: false },
      stream: false,
      translatedBody: { stream: true },
      finalBody: null,
      requestStartTime: Date.now(),
      connectionId: "conn-codex-progress",
      apiKey: "key-progress",
      clientRawRequest: { endpoint: "/v1/chat/completions" },
      onRequestSuccess: vi.fn(),
      trackDone: vi.fn(),
      appendLog: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    await expect(result.response.json()).resolves.toMatchObject({
      choices: [{ message: { content: "pong" } }],
      usage: { total_tokens: 5 },
    });
  });
});

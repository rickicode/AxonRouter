import { describe, expect, it, vi } from "vitest";

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

describe("handleForcedSSEToJson timeout handling", () => {
  it("returns 504 when Responses API SSE conversion aborts on upstream timeout", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stream = new ReadableStream({
      start(controller) {
        controller.error(Object.assign(new Error("openai upstream timed out after 45000ms"), {
          name: "AbortError",
          code: "UPSTREAM_TIMEOUT",
          timeoutMs: 45000,
        }));
      },
    });

    const providerResponse = new Response(stream, {
      headers: { "content-type": "text/event-stream" },
    });

    const result = await handleForcedSSEToJson({
      providerResponse,
      sourceFormat: "openai",
      provider: "openai",
      model: "gpt-5.4",
      body: { stream: false },
      stream: false,
      translatedBody: { stream: true },
      finalBody: null,
      requestStartTime: Date.now(),
      connectionId: "conn-1",
      apiKey: "key-1",
      clientRawRequest: { endpoint: "/v1/chat/completions" },
      onRequestSuccess: vi.fn(),
      trackDone: vi.fn(),
      appendLog: vi.fn(),
    });

    expect(result.success).toBe(false);
    expect(result.response.status).toBe(504);
    await expect(result.response.json()).resolves.toMatchObject({
      error: expect.objectContaining({
        message: "openai upstream timed out after 45000ms",
        code: "gateway_timeout",
      }),
    });
    spy.mockRestore();
  });
});

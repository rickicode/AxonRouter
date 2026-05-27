import { beforeEach, describe, expect, it, vi } from "vitest";

const handleChatCore = vi.fn();

vi.mock("../../open-sse/handlers/chatCore.ts", () => ({
  handleChatCore,
}));

vi.mock("../../open-sse/translator/helpers/responsesApiHelper.ts", () => ({
  convertResponsesApiFormat: vi.fn((body) => ({ ...body })),
}));

vi.mock("../../open-sse/transformer/responsesTransformer.tsx", () => ({
  createResponsesApiTransformStream: vi.fn(),
}));

const { handleResponsesCore } = await import("../../open-sse/handlers/responsesHandler.ts");

describe("handleResponsesCore timeout handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes caveman settings into chat core for responses requests", async () => {
    handleChatCore.mockResolvedValue({
      success: false,
      status: 400,
      error: "boom",
    });

    const cavemanSettings = { enabled: true, level: "full", applyToPassthrough: true };

    await handleResponsesCore({
      body: {},
      modelInfo: { provider: "codex", model: "gpt-5.4" },
      credentials: {},
      connectionId: "conn-1",
      cavemanSettings,
    });

    expect(handleChatCore).toHaveBeenCalledWith(expect.objectContaining({
      sourceFormatOverride: "openai-responses",
      cavemanSettings,
    }));
  });

  it("returns 504 when responses SSE-to-JSON conversion hits upstream timeout", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stream = new ReadableStream({
      start(controller) {
        controller.error(Object.assign(new Error("codex upstream timed out after 45000ms"), {
          name: "AbortError",
          code: "UPSTREAM_TIMEOUT",
          timeoutMs: 45000,
        }));
      },
    });

    handleChatCore.mockResolvedValue({
      success: true,
      response: new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      }),
    });

    const result = await handleResponsesCore({
      body: {},
      modelInfo: { provider: "codex", model: "gpt-5.4" },
      credentials: {},
      connectionId: "conn-1",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(504);
    await expect(result.response.json()).resolves.toMatchObject({
      error: expect.objectContaining({
        message: "codex upstream timed out after 45000ms",
        code: "gateway_timeout",
      }),
    });
    spy.mockRestore();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildRequestDetail,
  extractRequestConfig,
  stripInternalMetadata,
} from "../../open-sse/handlers/chatCore/requestDetail.ts";

describe("caveman request-detail sanitizer", () => {
  it("strips internal __axonrouter metadata recursively", () => {
    const value = {
      ok: true,
      __axonrouterCaveman: true,
      nested: {
        keep: 1,
        __axonrouterDebug: "x",
      },
      list: [
        { keep: "yes", __axonrouterInner: 1 },
        "plain",
      ],
    };

    expect(stripInternalMetadata(value)).toEqual({
      ok: true,
      nested: { keep: 1 },
      list: [{ keep: "yes" }, "plain"],
    });
  });

  it("sanitizes extracted request config before persistence", () => {
    const result = extractRequestConfig({
      model: "openai/gpt-5",
      messages: [{ role: "user", content: "hi", __axonrouterCaveman: true }],
      metadata: { requestId: "1", __axonrouterDebug: true },
      stream: true,
      __axonrouterTop: true,
    }, true);

    expect(result).toEqual({
      model: "openai/gpt-5",
      messages: [{ role: "user", content: "hi" }],
      metadata: { requestId: "1" },
      stream: true,
    });
  });

  it("sanitizes provider request and response payloads in request details", () => {
    const detail = buildRequestDetail({
      provider: "openai",
      model: "gpt-5",
      request: { body: { messages: [{ role: "user", __axonrouterCaveman: true, content: "hi" }] } },
      providerRequest: { input: [{ type: "message", __axonrouterCaveman: true }] },
      providerResponse: { trace: { ok: true }, __axonrouterDebug: true },
      response: { output: { text: "done", __axonrouterDebug: true } },
    });

    expect(detail.request).toEqual({ body: { messages: [{ role: "user", content: "hi" }] } });
    expect(detail.providerRequest).toEqual({ input: [{ type: "message" }] });
    expect(detail.providerResponse).toEqual({ trace: { ok: true } });
    expect(detail.response).toEqual({ output: { text: "done" } });
  });
});

import { describe, expect, it } from "vitest";

describe("failed-request-error-storage", () => {
  it("sanitizes and preserves error response on failure in request-details route logic", () => {
    const rawDetail = {
      id: "test-err-1",
      timestamp: new Date().toISOString(),
      provider: "cline-free",
      model: "z-ai/glm-5.3-flash",
      status: "error",
      request: { messages: [{ role: "user", content: "secret prompt" }] },
      providerRequest: { messages: [{ role: "user", content: "secret prompt" }] },
      providerResponse: { error: "empty response content", success: false },
      response: { error: "empty response content", status: 500, thinking: null },
    };

    const isFailed = rawDetail.status !== "success" || Boolean(rawDetail.error || rawDetail.response?.error);
    const redacted = { ...rawDetail };

    for (const key of ["request", "providerRequest", "providerResponse", "response"]) {
      if (redacted[key] !== undefined) {
        if (isFailed && (key === "response" || key === "providerResponse")) {
          continue;
        }
        redacted[key] = { redacted: true };
      }
    }

    if (isFailed) {
      redacted.error = rawDetail.response?.error || rawDetail.error || "Error";
    }

    expect(redacted.request).toEqual({ redacted: true });
    expect(redacted.providerRequest).toEqual({ redacted: true });
    expect(redacted.response).toEqual({ error: "empty response content", status: 500, thinking: null });
    expect(redacted.error).toBe("empty response content");
  });

  it("redacts response for successful requests to protect user conversation history", () => {
    const rawDetail = {
      id: "test-ok-1",
      timestamp: new Date().toISOString(),
      provider: "cline-free",
      model: "z-ai/glm-5.3-flash",
      status: "success",
      request: { messages: [{ role: "user", content: "hello" }] },
      providerRequest: { messages: [{ role: "user", content: "hello" }] },
      response: { content: "hi there!" },
    };

    const isFailed = rawDetail.status !== "success" || Boolean(rawDetail.error || rawDetail.response?.error);
    const redacted = { ...rawDetail };

    for (const key of ["request", "providerRequest", "providerResponse", "response"]) {
      if (redacted[key] !== undefined) {
        if (isFailed && (key === "response" || key === "providerResponse")) {
          continue;
        }
        redacted[key] = { redacted: true };
      }
    }

    expect(redacted.request).toEqual({ redacted: true });
    expect(redacted.response).toEqual({ redacted: true });
    expect(redacted.error).toBeUndefined();
  });
});

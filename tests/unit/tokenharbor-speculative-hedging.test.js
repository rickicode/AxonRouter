import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

const authMock = {
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(),
};
vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: (...args) => authMock.getProviderCredentials(...args),
  markAccountUnavailable: (...args) => authMock.markAccountUnavailable(...args),
}));

const { getExecutor } = await import("../../open-sse/executors/index.js");
const { TokenHarborExecutor } = await import("../../open-sse/executors/tokenharbor.js");

beforeEach(() => {
  fetchMock.mockReset();
  authMock.getProviderCredentials.mockReset();
  authMock.markAccountUnavailable.mockReset();
});

describe("TokenHarbor Speculative Hedging", () => {
  it("resolves TokenHarborExecutor for provider tokenharbor and th alias", () => {
    const ex1 = getExecutor("tokenharbor");
    const ex2 = getExecutor("th");
    expect(ex1).toBeInstanceOf(TokenHarborExecutor);
    expect(ex2).toBeInstanceOf(TokenHarborExecutor);
  });

  it("builds correct URL and default headers", () => {
    const ex = new TokenHarborExecutor();
    const url = ex.buildUrl("deepseek-v4.1-flash:free", true);
    expect(url).toBe("https://tokenharbor.ai/v1/chat/completions");

    const headers = ex.buildHeaders({ apiKey: "test_key_123" }, true);
    expect(headers["Authorization"]).toBe("Bearer test_key_123");
    expect(headers["Accept"]).toBe("text/event-stream");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("ensures stream_options include_usage is appended when streaming", () => {
    const ex = new TokenHarborExecutor();
    const body = { model: "deepseek-v4.1-flash:free", messages: [{ role: "user", content: "hi" }] };
    const transformed = ex.transformRequest("deepseek-v4.1-flash:free", body, true);
    expect(transformed.stream_options).toEqual({ include_usage: true });
  });

  it("completes immediately when the first request succeeds quickly", async () => {
    const ex = new TokenHarborExecutor();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {\"choices\":[]}\n\n"));
        controller.close();
      }
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: stream,
    });

    const result = await ex.execute({
      model: "deepseek-v4.1-flash:free",
      body: { messages: [] },
      stream: true,
      credentials: { connectionId: "c1", apiKey: "k1" },
    });

    expect(result.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authMock.getProviderCredentials).not.toHaveBeenCalled();
  });
});

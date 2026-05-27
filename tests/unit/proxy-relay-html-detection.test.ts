import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We need to test proxyAwareFetch internals, so we mock at globalThis.fetch level
const mockFetch = vi.fn();
const originalGlobalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalGlobalFetch;
  vi.clearAllMocks();
  vi.resetModules();
});

function makeHtmlResponse(status: number, body = "<html><body>Error</body></html>") {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function makeNoContentTypeResponse(status: number, body = "<html><body>Error</body></html>") {
  return new Response(body, {
    status,
    headers: {},
  });
}

function makeJsonResponse(status: number, body: Record<string, unknown> = { error: "rate_limited" }) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeSseResponse(status: number) {
  return new Response("data: hello\n\n", {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

async function loadModule() {
  return import("../../open-sse/utils/proxyFetch.ts");
}

describe("Relay HTML error detection", () => {
  describe("relay path", () => {
    it("should detect relay response with status 429 + text/html as relay error (strictProxy=true throws)", async () => {
      mockFetch.mockResolvedValueOnce(makeHtmlResponse(429));

      const { proxyAwareFetch } = await loadModule();

      try {
        await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
          relayUrl: "https://relay.workers.dev",
          strictProxy: true,
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).toMatch(/Relay returned HTML error page/);
        expect(err.phase).toBe("relay-html-error");
      }
    });

    it("should fall back to direct fetch when relay returns HTML error and strictProxy=false", async () => {
      const directResponse = makeJsonResponse(200, { choices: [] });
      // First call is the relay fetch (returns HTML error), second is the direct fallback
      mockFetch.mockResolvedValueOnce(makeHtmlResponse(429));
      mockFetch.mockResolvedValueOnce(directResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        relayUrl: "https://relay.workers.dev",
        strictProxy: false,
      });

      expect(result).toBe(directResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should detect relay response with status 502 + text/html as relay error", async () => {
      mockFetch.mockResolvedValueOnce(makeHtmlResponse(502, "<!DOCTYPE html><html><body>Bad Gateway</body></html>"));

      const { proxyAwareFetch } = await loadModule();

      await expect(
        proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
          relayUrl: "https://relay.workers.dev",
          strictProxy: true,
        })
      ).rejects.toThrow(/Relay returned HTML error page/);
    });

    it("should detect relay response with status 503 + text/html as relay error", async () => {
      const directResponse = makeJsonResponse(200, { ok: true });
      mockFetch.mockResolvedValueOnce(makeHtmlResponse(503));
      mockFetch.mockResolvedValueOnce(directResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        relayUrl: "https://relay.workers.dev",
        strictProxy: false,
      });

      expect(result).toBe(directResponse);
    });

    it("should NOT treat status 200 + text/html as relay error (pass through)", async () => {
      const htmlOkResponse = makeHtmlResponse(200, "<html><body>OK</body></html>");
      mockFetch.mockResolvedValueOnce(htmlOkResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        relayUrl: "https://relay.workers.dev",
        strictProxy: true,
      });

      expect(result).toBe(htmlOkResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should NOT treat status 429 + application/json as relay error (pass through as provider response)", async () => {
      const jsonErrorResponse = makeJsonResponse(429, { error: { message: "Rate limit exceeded" } });
      mockFetch.mockResolvedValueOnce(jsonErrorResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        relayUrl: "https://relay.workers.dev",
        strictProxy: true,
      });

      expect(result).toBe(jsonErrorResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should NOT treat text/event-stream responses as relay error", async () => {
      const sseResponse = makeSseResponse(503);
      mockFetch.mockResolvedValueOnce(sseResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        relayUrl: "https://relay.workers.dev",
        strictProxy: true,
      });

      expect(result).toBe(sseResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should log a warning when relay HTML error is detected", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const directResponse = makeJsonResponse(200, { ok: true });
      mockFetch.mockResolvedValueOnce(makeHtmlResponse(429));
      mockFetch.mockResolvedValueOnce(directResponse);

      const { proxyAwareFetch } = await loadModule();
      await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        relayUrl: "https://relay.workers.dev",
        strictProxy: false,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[ProxyFetch] Relay returned HTML error (likely rate limit/block), status=429")
      );
      warnSpy.mockRestore();
    });

    it("should detect relay response with missing content-type header as relay error", async () => {
      const directResponse = makeJsonResponse(200, { ok: true });
      mockFetch.mockResolvedValueOnce(makeNoContentTypeResponse(429));
      mockFetch.mockResolvedValueOnce(directResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        relayUrl: "https://relay.workers.dev",
        strictProxy: false,
      });

      expect(result).toBe(directResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should detect relay response with missing content-type as error (strictProxy=true throws)", async () => {
      mockFetch.mockResolvedValueOnce(makeNoContentTypeResponse(502));

      const { proxyAwareFetch } = await loadModule();

      await expect(
        proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
          relayUrl: "https://relay.workers.dev",
          strictProxy: true,
        })
      ).rejects.toThrow(/Relay returned HTML error page/);
    });

    it("should NOT re-throw non-diagnostic errors that happen to have a .phase property", async () => {
      const directResponse = makeJsonResponse(200, { ok: true });
      const fakeError = new Error("Some third-party error");
      (fakeError as any).phase = "some-random-phase";
      mockFetch.mockRejectedValueOnce(fakeError);
      mockFetch.mockResolvedValueOnce(directResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        relayUrl: "https://relay.workers.dev",
        strictProxy: false,
      });

      // Should fall through to direct fetch, not re-throw
      expect(result).toBe(directResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("HTTP proxy path", () => {
    it("should detect HTTP proxy response with status 407 + text/html as proxy error (strictProxy=true throws)", async () => {
      mockFetch.mockResolvedValueOnce(makeHtmlResponse(407, "<html>Proxy Auth Required</html>"));

      const { proxyAwareFetch } = await loadModule();

      try {
        await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
          connectionProxyEnabled: true,
          url: "http://proxy.example.com:8080",
          strictProxy: true,
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).toMatch(/HTTP proxy returned HTML error page/);
        expect(err.phase).toBe("proxy-html-error");
      }
    });

    it("should fall back to direct when HTTP proxy returns HTML error and strictProxy=false", async () => {
      const directResponse = makeJsonResponse(200, { choices: [] });
      mockFetch.mockResolvedValueOnce(makeHtmlResponse(502));
      mockFetch.mockResolvedValueOnce(directResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        connectionProxyEnabled: true,
        url: "http://proxy.example.com:8080",
        strictProxy: false,
      });

      expect(result).toBe(directResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should NOT treat HTTP proxy 200 + text/html as proxy error", async () => {
      const htmlOkResponse = makeHtmlResponse(200);
      mockFetch.mockResolvedValueOnce(htmlOkResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        connectionProxyEnabled: true,
        url: "http://proxy.example.com:8080",
        strictProxy: true,
      });

      expect(result).toBe(htmlOkResponse);
    });

    it("should NOT treat HTTP proxy 502 + application/json as proxy error", async () => {
      const jsonResponse = makeJsonResponse(502, { error: "Bad Gateway" });
      mockFetch.mockResolvedValueOnce(jsonResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        connectionProxyEnabled: true,
        url: "http://proxy.example.com:8080",
        strictProxy: true,
      });

      expect(result).toBe(jsonResponse);
    });

    it("should detect HTTP proxy response with missing content-type as proxy error", async () => {
      const directResponse = makeJsonResponse(200, { choices: [] });
      mockFetch.mockResolvedValueOnce(makeNoContentTypeResponse(502));
      mockFetch.mockResolvedValueOnce(directResponse);

      const { proxyAwareFetch } = await loadModule();
      const result = await proxyAwareFetch("https://api.openai.com/v1/chat/completions", {}, {
        connectionProxyEnabled: true,
        url: "http://proxy.example.com:8080",
        strictProxy: false,
      });

      expect(result).toBe(directResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

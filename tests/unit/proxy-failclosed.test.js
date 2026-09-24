// Fail-closed proxy for keyless/noAuth providers: a dead proxy must throw
// (so chatCore rotates pools) instead of silently falling back to direct
// (which burns the shared server IP into an upstream 429). Offline: local
// HTTP target + unroutable proxy port.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const DEAD_PROXY = "http://127.0.0.1:9";
let server;
let targetUrl;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("direct-ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  targetUrl = `http://127.0.0.1:${server.address().port}/ping`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("proxyAwareFetch failClosedProxy", () => {
  it("legacy path still falls back to direct when the proxy is dead", async () => {
    const res = await proxyAwareFetch(targetUrl, {}, {
      connectionProxyEnabled: true,
      connectionProxyUrl: DEAD_PROXY,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("direct-ok");
  });

  it("failClosedProxy throws a [ProxyFetch]-marked error instead of direct fallback", async () => {
    let err = null;
    try {
      await proxyAwareFetch(targetUrl, {}, {
        connectionProxyEnabled: true,
        connectionProxyUrl: DEAD_PROXY,
        failClosedProxy: true,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
    // chatCore's isProxyNetworkError keys off this marker for pool rotation.
    expect(String(err?.message).toLowerCase()).toContain("[proxyfetch]");
  });

  it("no proxy configured behaves as direct regardless of flag", async () => {
    const res = await proxyAwareFetch(targetUrl, {}, { failClosedProxy: true });
    expect(res.status).toBe(200);
  });
});

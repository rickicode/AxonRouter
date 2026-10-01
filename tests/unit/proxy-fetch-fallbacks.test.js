/**
 * proxyFetch fallback guards.
 *
 * 1. Self-signed cert errors get ONE retry with verification relaxed; every
 *    other error class must propagate unchanged after a single attempt (no
 *    blanket insecure mode).
 * 2. strictProxy holds even when no proxy resolves — but only when a proxy was
 *    actually intended (a Qoder-style "don't replay directly" caller with
 *    nothing configured must keep working).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

const originalFetch = globalThis.fetch;

function certError(code = "SELF_SIGNED_CERT_IN_CHAIN") {
  return Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("self signed certificate"), { code }),
  });
}

function netError(code = "ECONNREFUSED") {
  return Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("connect ECONNREFUSED"), { code }),
  });
}

// A relaxed dispatcher carries rejectUnauthorized:false somewhere in its
// undici options (ProxyAgent: requestTls, Agent: connect).
function relaxesVerification(dispatcher) {
  const seen = new Set();
  const walk = (value, depth) => {
    if (!value || typeof value !== "object" || depth > 4 || seen.has(value)) return false;
    seen.add(value);
    if (value.rejectUnauthorized === false) return true;
    for (const key of [...Object.getOwnPropertyNames(value), ...Object.getOwnPropertySymbols(value)]) {
      let child;
      try { child = value[key]; } catch { continue; }
      if (walk(child, depth + 1)) return true;
    }
    return false;
  };
  return walk(dispatcher, 0);
}

beforeEach(() => { delete process.env.STRICT_SSL; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.STRICT_SSL;
});

describe("proxyAwareFetch — self-signed certificate fallback", () => {
  it("retries once with verification relaxed on a direct self-signed cert error", async () => {
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(certError())
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await proxyAwareFetch("https://upstream.example/v1/messages", { method: "POST", body: "{}" });

    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const [, retryOptions] = globalThis.fetch.mock.calls[1];
    expect(relaxesVerification(retryOptions.dispatcher)).toBe(true);
  });

  it("retries through the proxy with relaxed TLS when the proxy presents a self-signed cert", async () => {
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(certError("DEPTH_ZERO_SELF_SIGNED_CERT"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await proxyAwareFetch(
      "https://upstream.example/v1/messages",
      { method: "POST", body: "{}" },
      { connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.local:8080" },
    );

    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const [firstOptions, retryOptions] = globalThis.fetch.mock.calls.map((call) => call[1]);
    expect(relaxesVerification(firstOptions.dispatcher)).toBe(false);
    expect(relaxesVerification(retryOptions.dispatcher)).toBe(true);
  });

  it("does NOT retry on a generic fetch error", async () => {
    const err = netError();
    globalThis.fetch = vi.fn().mockRejectedValueOnce(err);

    await expect(proxyAwareFetch("https://upstream.example/v1/messages")).rejects.toBe(err);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on a message-only self-signed error (detection is code-based)", async () => {
    const err = Object.assign(new TypeError("fetch failed"), {
      cause: new Error("self-signed certificate in certificate chain"),
    });
    globalThis.fetch = vi.fn().mockRejectedValueOnce(err);

    await expect(proxyAwareFetch("https://upstream.example/v1/messages")).rejects.toBe(err);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("honors STRICT_SSL as an opt-out", async () => {
    process.env.STRICT_SSL = "true";
    const err = certError();
    globalThis.fetch = vi.fn().mockRejectedValueOnce(err);

    await expect(proxyAwareFetch("https://upstream.example/v1/messages")).rejects.toBe(err);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT replay a request whose body stream is already locked", async () => {
    const err = certError();
    globalThis.fetch = vi.fn().mockRejectedValueOnce(err);
    const body = { locked: true, getReader: () => ({}) };

    await expect(proxyAwareFetch("https://upstream.example/v1/messages", { method: "POST", body })).rejects.toBe(err);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("proxyAwareFetch — strictProxy when no proxy resolves", () => {
  it("throws instead of leaking to direct when a proxy was intended but never resolved", async () => {
    await expect(
      proxyAwareFetch(
        "https://upstream.example/v1/messages",
        {},
        { strictProxy: true, connectionProxyEnabled: true, proxyPoolId: "pool-1" },
      ),
    ).rejects.toThrow("[ProxyFetch] Proxy required but none resolved (strictProxy=true)");
  });

  it("keeps working for strictProxy callers that intend no proxy at all (Qoder)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await proxyAwareFetch(
      "https://upstream.example/v1/messages",
      {},
      { strictProxy: true, connectionProxyEnabled: false, connectionProxyUrl: "" },
    );

    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
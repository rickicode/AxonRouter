import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock proxyTest to isolate unit test from external internet/network
vi.mock("@/lib/network/proxyTest.js", () => ({
  testProxyUrl: vi.fn(),
}));

import { testProxyUrl } from "@/lib/network/proxyTest.js";
import { POST } from "@/app/api/proxy-groups/verify-subscription/route.js";

describe("POST /api/proxy-groups/verify-subscription", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 400 if URL is missing or empty", async () => {
    const req = { json: async () => ({}) };
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Subscription URL is required/i);
  });

  it("returns 400 if URL format is invalid", async () => {
    const req = { json: async () => ({ url: "not-a-valid-url" }) };
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid subscription URL format/i);
  });

  it("returns 400 if subscription HTTP response is not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const req = { json: async () => ({ url: "https://example.com/subs.txt" }) };
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/HTTP 404/i);
  });

  it("returns 400 if subscription feed contains 0 valid proxies", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "invalid text without any proxy lines\n# just comments\n",
    });

    const req = { json: async () => ({ url: "https://example.com/subs.txt" }) };
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.totalCount).toBe(0);
    expect(data.error).toMatch(/No valid proxies could be parsed/i);
  });

  it("verifies feed with >= 4 responsive proxies and returns ok: true with totalCount", async () => {
    const mockProxyFeed = [
      "http://1.1.1.1:8080",
      "http://2.2.2.2:8080",
      "http://3.3.3.3:8080",
      "http://4.4.4.4:8080",
      "http://5.5.5.5:8080",
      "http://6.6.6.6:8080",
      "http://7.7.7.7:8080",
      "http://8.8.8.8:8080",
    ].join("\n");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockProxyFeed,
    });

    // Mock first 5 proxies succeed, 6th fails
    testProxyUrl
      .mockResolvedValueOnce({ ok: true, status: 200, elapsedMs: 120 })
      .mockResolvedValueOnce({ ok: true, status: 200, elapsedMs: 130 })
      .mockResolvedValueOnce({ ok: true, status: 200, elapsedMs: 140 })
      .mockResolvedValueOnce({ ok: true, status: 200, elapsedMs: 150 })
      .mockResolvedValueOnce({ ok: true, status: 200, elapsedMs: 160 })
      .mockResolvedValue({ ok: false, status: 500, error: "Connection timed out" });

    const req = {
      json: async () => ({
        url: "https://example.com/subs.txt",
        minRequired: 4,
      }),
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.totalCount).toBe(8);
    expect(data.verifiedCount).toBe(5);
    expect(data.minRequired).toBe(4);
    expect(data.message).toMatch(/Successfully verified 5 proxies/i);
    expect(data.sampleResults).toHaveLength(6);
  });

  it("fails verification if fewer than 4 proxies are active (e.g. only 2 active)", async () => {
    const mockProxyFeed = [
      "http://10.0.0.1:8080",
      "http://10.0.0.2:8080",
      "http://10.0.0.3:8080",
      "http://10.0.0.4:8080",
      "http://10.0.0.5:8080",
    ].join("\n");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockProxyFeed,
    });

    // Only 2 proxies succeed
    testProxyUrl
      .mockResolvedValueOnce({ ok: true, status: 200, elapsedMs: 100 })
      .mockResolvedValueOnce({ ok: true, status: 200, elapsedMs: 110 })
      .mockResolvedValue({ ok: false, status: 500, error: "ECONNREFUSED" });

    const req = {
      json: async () => ({
        url: "https://example.com/subs.txt",
        minRequired: 4,
      }),
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(false);
    expect(data.totalCount).toBe(5);
    expect(data.verifiedCount).toBe(2);
    expect(data.minRequired).toBe(4);
    expect(data.message).toMatch(/Only 2\/5 tested proxies responded \(minimum 4 required\)/i);
  });

  it("correctly handles JSON array format from subscription feed", async () => {
    const jsonFeed = JSON.stringify([
      "http://192.168.1.10:8080",
      "http://192.168.1.11:8080",
      "http://192.168.1.12:8080",
      "http://192.168.1.13:8080",
    ]);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => jsonFeed,
    });

    testProxyUrl.mockResolvedValue({ ok: true, status: 200, elapsedMs: 95 });

    const req = {
      json: async () => ({
        url: "https://example.com/subs.json",
        minRequired: 4,
      }),
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.totalCount).toBe(4);
    expect(data.verifiedCount).toBe(4);
  });
});

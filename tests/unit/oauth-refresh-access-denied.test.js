import { describe, it, expect } from "vitest";
import { classifyOAuthRefreshError } from "../../open-sse/services/tokenRefresh/providers.js";
import { isUnrecoverableRefreshError } from "../../open-sse/services/tokenRefresh.js";
import { runBackgroundTokenRefreshTick } from "../../src/sse/services/backgroundTokenRefresh.js";

describe("classifyOAuthRefreshError — permanent grant failures", () => {
  // Exact AWS SSO OIDC body observed on prod: Kiro refresh retried forever.
  it("marks AWS SSO 400 access_denied as permanent", () => {
    const body = '{"error":"access_denied","error_description":"Access denied","location":null,"reason":null}';
    const result = classifyOAuthRefreshError(body, 400);
    expect(result.permanent).toBe(true);
    expect(isUnrecoverableRefreshError({ error: "unrecoverable_refresh_error", code: result.code })).toBe(true);
  });

  it("marks 403 access_denied as permanent", () => {
    expect(classifyOAuthRefreshError('{"error":"access_denied"}', 403).permanent).toBe(true);
  });

  it("keeps transient upstream errors retryable", () => {
    expect(classifyOAuthRefreshError('{"error":"server_error"}', 500).permanent).toBe(false);
    expect(classifyOAuthRefreshError("slow_down", 429).permanent).toBe(false);
    expect(classifyOAuthRefreshError("temporarily_unavailable", 503).permanent).toBe(false);
  });

  it("keeps existing invalid_grant classification", () => {
    expect(classifyOAuthRefreshError('{"error":"invalid_grant"}', 400).permanent).toBe(true);
  });
});

describe("runBackgroundTokenRefreshTick — parallel drain", () => {
  it("refreshes all due connections concurrently within per-provider cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const refreshed = [];

    await runBackgroundTokenRefreshTick({
      loadConnections: async () =>
        Array.from({ length: 6 }, (_, i) => ({
          id: `g${i}`,
          provider: "grok-cli",
          authType: "oauth",
          refreshToken: "r",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        })).concat(
          Array.from({ length: 2 }, (_, i) => ({
            id: `a${i}`,
            provider: "antigravity",
            authType: "oauth",
            refreshToken: "r",
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          })),
        ),
      refreshConnection: async (conn) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        refreshed.push(conn.id);
        return { id: conn.id };
      },
      sleep: async () => {},
    });

    expect(refreshed).toHaveLength(8);
    expect(maxInFlight).toBeGreaterThanOrEqual(2); // actually parallel
    expect(maxInFlight).toBeLessThanOrEqual(6); // 4 (grok-cli cap) + 2 (antigravity cap)
  });

  it("does not starve a second provider while one queue drains", async () => {
    const order = [];
    const t0 = Date.now();
    let kiroDoneAt = null;

    await runBackgroundTokenRefreshTick({
      loadConnections: async () =>
        Array.from({ length: 4 }, (_, i) => ({
          id: `slow${i}`,
          provider: "grok-cli",
          authType: "oauth",
          refreshToken: "r",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        })).concat([{
          id: "fast0",
          provider: "kiro",
          authType: "oauth",
          refreshToken: "r",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }]),
      refreshConnection: async (conn) => {
        order.push(conn.provider);
        if (conn.provider === "kiro") kiroDoneAt = Date.now() - t0;
        if (conn.provider === "grok-cli") await new Promise((r) => setTimeout(r, 50));
        return { id: conn.id };
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    });

    // Real pacing: 4 grok-cli items x (50ms refresh + 1.7s delay) — serial
    // cross-provider draining would hold kiro ~7s. Parallel queues let kiro
    // finish in its own queue immediately.
    expect(kiroDoneAt).toBeLessThan(500);
  });
});

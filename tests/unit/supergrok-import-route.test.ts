/**
 * Unit tests for SuperGrok import route (/api/oauth/supergrok/import)
 *
 * Covers:
 *  - Missing refreshToken/accessToken returns 400
 *  - Valid refreshToken creates connection with provider='xai', authType='supergrok_oauth'
 *  - xAI 403 response surfaces as "API access denied"
 *  - Token refresh failure returns 401
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;

const createProviderConnection = vi.fn(async (data) => ({ id: "conn-supergrok", ...data }));
const finalizePostConnectValidation = vi.fn(async (connection) => ({
  ...connection,
  routingStatus: connection.routingStatus ?? "eligible",
  healthStatus: connection.healthStatus ?? "healthy",
  quotaState: connection.quotaState ?? "ok",
  authState: connection.authState ?? "ok",
  reasonCode: connection.reasonCode ?? null,
  reasonDetail: connection.reasonDetail ?? null,
  lastCheckedAt: connection.lastCheckedAt,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init?: any) => ({
      status: init?.status || 200,
      body,
      json: async () => body,
    }),
  },
}));

vi.mock("@/lib/connectionAccess", () => ({
  createCurrentProviderConnection: createProviderConnection,
}));

vi.mock("@/lib/oauth/postConnectValidation", () => ({
  finalizePostConnectValidation,
}));

describe("SuperGrok import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns 400 when neither refreshToken nor accessToken is provided", async () => {
    const { POST } = await import("../../src/app/api/oauth/supergrok/import/route.ts");
    const response = await POST(
      new Request("http://localhost/api/oauth/supergrok/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("required");
  });

  it("valid refreshToken creates connection with provider=xai and authType=supergrok_oauth", async () => {
    // First call: token refresh to auth.x.ai
    // Second call: validate token at api.x.ai/v1/models
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: "fresh-access-token",
          refresh_token: "fresh-refresh-token",
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      });

    const { POST } = await import("../../src/app/api/oauth/supergrok/import/route.ts");
    const response = await POST(
      new Request("http://localhost/api/oauth/supergrok/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "my-refresh-token" }),
      })
    );

    expect(response.status).toBe(200);
    expect(createProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "xai",
        authType: "supergrok_oauth",
        accessToken: "fresh-access-token",
        refreshToken: "fresh-refresh-token",
      })
    );
  });

  it("xAI 403 response surfaces as API access denied", async () => {
    // First call: token refresh succeeds
    // Second call: validate returns 403
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: "valid-token",
          refresh_token: "valid-refresh",
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: "forbidden" }),
      });

    const { POST } = await import("../../src/app/api/oauth/supergrok/import/route.ts");
    const response = await POST(
      new Request("http://localhost/api/oauth/supergrok/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "my-refresh-token" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("API access denied");
  });

  it("token refresh failure returns 401", async () => {
    // Token refresh fails
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("invalid_grant"),
    });

    const { POST } = await import("../../src/app/api/oauth/supergrok/import/route.ts");
    const response = await POST(
      new Request("http://localhost/api/oauth/supergrok/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "expired-refresh-token" }),
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Token refresh failed");
  });

  it("valid accessToken with successful validation creates connection", async () => {
    // Only one call: validate token at api.x.ai/v1/models
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });

    const { POST } = await import("../../src/app/api/oauth/supergrok/import/route.ts");
    const response = await POST(
      new Request("http://localhost/api/oauth/supergrok/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "direct-access-token", refreshToken: "rt", expiresIn: 1800 }),
      })
    );

    expect(response.status).toBe(200);
    expect(createProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "xai",
        authType: "supergrok_oauth",
        accessToken: "direct-access-token",
        refreshToken: "rt",
      })
    );
  });
});

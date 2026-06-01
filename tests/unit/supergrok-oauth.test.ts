/**
 * Unit tests for SuperGrok OAuth provider configuration
 *
 * Covers:
 *  - Provider existence and flow type
 *  - buildAuthUrl generates correct URL with PKCE params
 *  - exchangeToken calls tokenUrl with correct form-encoded body
 *  - mapTokens extracts access_token, refresh_token, expires_in
 *  - mapTokens extracts email from JWT payload
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;

vi.mock("../../open-sse/index.ts", () => ({}));

describe("SuperGrok OAuth provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("supergrok provider exists and has flowType authorization_code_pkce", async () => {
    const { getProvider } = await import("../../src/lib/oauth/providers.ts");
    const provider = getProvider("supergrok");

    expect(provider).toBeDefined();
    expect(provider.flowType).toBe("authorization_code_pkce");
  });

  it("buildAuthUrl generates correct URL with PKCE params", async () => {
    const { getProvider } = await import("../../src/lib/oauth/providers.ts");
    const provider = getProvider("supergrok");

    const redirectUri = "http://localhost:3000/callback";
    const state = "test-state-123";
    const codeChallenge = "test-code-challenge";

    const authUrl = provider.buildAuthUrl(provider.config, redirectUri, state, codeChallenge);

    expect(authUrl).toContain("https://auth.x.ai/oauth2/authorize");
    expect(authUrl).toContain("response_type=code");
    expect(authUrl).toContain("client_id=b1a00492-073a-47ea-816f-4c329264a828");
    expect(authUrl).toContain("code_challenge_method=S256");
    expect(authUrl).toContain(`code_challenge=${encodeURIComponent(codeChallenge)}`);
    expect(authUrl).toContain(`state=${encodeURIComponent(state)}`);
    expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
    expect(authUrl).toContain("grok-cli%3Aaccess");
  });

  it("exchangeToken calls tokenUrl with correct form-encoded body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
      }),
    });

    const { getProvider } = await import("../../src/lib/oauth/providers.ts");
    const provider = getProvider("supergrok");

    const code = "auth-code-123";
    const redirectUri = "http://localhost:3000/callback";
    const codeVerifier = "test-code-verifier";

    await provider.exchangeToken(provider.config, code, redirectUri, codeVerifier);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://auth.x.ai/oauth2/token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
        }),
      })
    );

    const fetchCall = (global.fetch as any).mock.calls[0];
    const body = fetchCall[1].body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("b1a00492-073a-47ea-816f-4c329264a828");
    expect(body.get("code")).toBe(code);
    expect(body.get("redirect_uri")).toBe(redirectUri);
    expect(body.get("code_verifier")).toBe(codeVerifier);
  });

  it("mapTokens extracts access_token, refresh_token, expires_in", async () => {
    const { getProvider } = await import("../../src/lib/oauth/providers.ts");
    const provider = getProvider("supergrok");

    // Create a simple non-JWT token for testing basic field extraction
    const result = provider.mapTokens({
      access_token: "plain-token",
      refresh_token: "refresh-abc",
      expires_in: 7200,
    });

    expect(result.accessToken).toBe("plain-token");
    expect(result.refreshToken).toBe("refresh-abc");
    expect(result.expiresIn).toBe(7200);
  });

  it("mapTokens extracts email from JWT payload", async () => {
    const { getProvider } = await import("../../src/lib/oauth/providers.ts");
    const provider = getProvider("supergrok");

    // Create a JWT with email in the payload
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ email: "user@xai.com", sub: "user-123" })).toString("base64url");
    const jwtToken = `${header}.${payload}.signature`;

    const result = provider.mapTokens({
      access_token: jwtToken,
      refresh_token: "refresh-token",
      expires_in: 3600,
    });

    expect(result.email).toBe("user@xai.com");
    expect(result.name).toBe("user@xai.com");
    expect(result.displayName).toBe("user@xai.com");
  });

  it("exchangeToken throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("invalid_grant"),
    });

    const { getProvider } = await import("../../src/lib/oauth/providers.ts");
    const provider = getProvider("supergrok");

    await expect(
      provider.exchangeToken(provider.config, "bad-code", "http://localhost/cb", "verifier")
    ).rejects.toThrow("Token exchange failed");
  });
});

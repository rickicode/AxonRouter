import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests cover the xAI OAuth provider, whose discovery step is a plain
 * `fetch("https://auth.x.ai/.well-known/openid-configuration")`. Two pieces of
 * global state make that hard to stub with `vi.stubGlobal` alone:
 *
 * 1. `open-sse/utils/proxyFetch.js` assigns `globalThis.fetch = patchedFetch` at
 *    import time and captures `const originalFetch = globalThis.fetch` at module
 *    scope. Whichever fetch exists when that module first evaluates becomes the
 *    transport for the rest of the worker, so a later `vi.stubGlobal` never
 *    reaches it and the stubbed request is silently replaced by a live HTTPS call
 *    to auth.x.ai. Whether that happens depends purely on module evaluation
 *    order — which is exactly why this file used to pass sometimes and time out
 *    other times on an untouched checkout.
 * 2. proxyFetch dispatches through undici whenever HTTP(S)_PROXY / ALL_PROXY is
 *    set, routing around the stub a second way.
 *
 * Fix both: mock the proxyFetch module itself so no patched fetch is ever
 * installed, and clear the proxy env vars for this file.
 */
vi.mock("open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (url, options = {}) => globalThis.__xaiTestFetch(url, options),
  default: (url, options = {}) => globalThis.__xaiTestFetch(url, options),
}));

const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "NO_PROXY",
  "no_proxy",
];
const savedProxyEnv = {};

/**
 * A fetch double that refuses to answer rather than returning undefined, so an
 * under-mocked call fails as a clear setup error instead of a confusing
 * "Cannot read properties of undefined (reading 'ok')" inside the provider.
 */
function makeStrictFetchMock() {
  return vi.fn(() => {
    throw new Error("fetch mock exhausted: queue an extra mockResolvedValueOnce()");
  });
}

/**
 * `src/lib/oauth/providers.js` is the provider registry index: it statically
 * imports every OAuth provider in the product. On a loaded machine that import
 * graph takes 14-25s to evaluate (measured), so a 15s per-test budget fails or
 * passes depending on what else the box is running — the classic flaky test.
 * These two tests genuinely need the index, so give them a budget that fits the
 * real cost instead of pretending it is 15s.
 */
const REGISTRY_IMPORT_TIMEOUT_MS = 120000;

describe("xai/oauth service", () => {
  let fetchMock;

  beforeEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      savedProxyEnv[key] = process.env[key];
      delete process.env[key];
    }
    vi.resetModules();
    fetchMock = makeStrictFetchMock();
    globalThis.__xaiTestFetch = fetchMock;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete globalThis.__xaiTestFetch;
    for (const key of PROXY_ENV_KEYS) {
      if (savedProxyEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedProxyEnv[key];
    }
  });

  it("validates discovered endpoints are https x.ai URLs", async () => {
    const { validateOAuthEndpoint } = await import("../../src/lib/oauth/services/xai.js");

    // This path validates strings only; no fetch is expected. Assert that so a
    // future refactor that starts fetching here fails here, not on a 15s timeout.
    expect(fetchMock).not.toHaveBeenCalled();

    expect(validateOAuthEndpoint("https://auth.x.ai/oauth2/authorize", "authorization_endpoint")).toBe(
      "https://auth.x.ai/oauth2/authorize"
    );
    expect(() => validateOAuthEndpoint("http://auth.x.ai/oauth2/authorize", "authorization_endpoint")).toThrow(
      /must use https/
    );
    expect(() => validateOAuthEndpoint("https://example.com/oauth2/authorize", "authorization_endpoint")).toThrow(
      /is not on x\.ai/
    );
  });

  it("discovers endpoints without custom user-agent headers", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorization_endpoint: "https://auth.x.ai/oauth2/authorize",
        token_endpoint: "https://auth.x.ai/oauth2/token",
      }),
    });

    const { discoverEndpoints } = await import("../../src/lib/oauth/services/xai.js");
    await expect(discoverEndpoints()).resolves.toEqual({
      authorizeUrl: "https://auth.x.ai/oauth2/authorize",
      tokenUrl: "https://auth.x.ai/oauth2/token",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.x.ai/.well-known/openid-configuration",
      expect.objectContaining({ headers: { Accept: "application/json" } })
    );
  });

  it("builds authorize URLs with CLIProxyAPI query extras", async () => {
    const { XaiService } = await import("../../src/lib/oauth/services/xai.js");
    const authUrl = new XaiService().buildXaiAuthUrl(
      "http://127.0.0.1:56121/callback",
      "state-1",
      "challenge-1",
      "https://auth.x.ai/oauth2/authorize"
    );
    const parsed = new URL(authUrl);

    // Endpoint is passed in explicitly, so discovery must not run.
    expect(fetchMock).not.toHaveBeenCalled();

    expect(parsed.origin + parsed.pathname).toBe("https://auth.x.ai/oauth2/authorize");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("b1a00492-073a-47ea-816f-4c329264a828");
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:56121/callback");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("state-1");
    expect(parsed.searchParams.get("nonce")).toMatch(/^[a-f0-9]{32}$/);
    expect(parsed.searchParams.get("plan")).toBe("generic");
    expect(parsed.searchParams.get("referrer")).toBe("cli-proxy-api");
  });

  it("generates dashboard auth data with CLIProxyAPI PKCE size and discovered endpoints", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorization_endpoint: "https://auth.x.ai/oauth2/authorize-from-discovery",
        token_endpoint: "https://auth.x.ai/oauth2/token-from-discovery",
      }),
    });

    const { generateAuthData } = await import("../../src/lib/oauth/providers.js");
    const data = await generateAuthData("xai", "http://127.0.0.1:56121/callback");
    const parsed = new URL(data.authUrl);

    // Discovery is memoised in a module-level cache, so it must run exactly
    // once. A second request means the cache regressed.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(data.codeVerifier).toHaveLength(128);
    expect(parsed.origin + parsed.pathname).toBe("https://auth.x.ai/oauth2/authorize-from-discovery");
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:56121/callback");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("plan")).toBe("generic");
    expect(parsed.searchParams.get("referrer")).toBe("cli-proxy-api");
  }, REGISTRY_IMPORT_TIMEOUT_MS);

  it("exchanges dashboard codes against the discovered xAI token endpoint", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorization_endpoint: "https://auth.x.ai/oauth2/authorize",
          token_endpoint: "https://auth.x.ai/oauth2/token-from-discovery",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        }),
      });

    const { exchangeTokens } = await import("../../src/lib/oauth/providers.js");
    const tokens = await exchangeTokens(
      "xai",
      "auth-code",
      "http://127.0.0.1:56121/callback",
      "verifier-1",
      "state-1"
    );

    expect(fetchMock.mock.calls[1][0]).toBe("https://auth.x.ai/oauth2/token-from-discovery");
    expect(fetchMock.mock.calls[1][1].body.get("grant_type")).toBe("authorization_code");
    expect(fetchMock.mock.calls[1][1].body.get("code")).toBe("auth-code");
    expect(fetchMock.mock.calls[1][1].body.get("code_verifier")).toBe("verifier-1");
    expect(tokens).toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
    });
  }, REGISTRY_IMPORT_TIMEOUT_MS);
});
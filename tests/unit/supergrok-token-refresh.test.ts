/**
 * Unit tests for xAI (SuperGrok) token refresh in DefaultExecutor
 *
 * Covers:
 *  - Successful token refresh returns accessToken, refreshToken, expiresIn
 *  - Failed refresh (fetch returns !ok) returns null
 *  - Missing refreshToken returns null
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;

vi.mock("../../open-sse/index.ts", () => ({}));

describe("SuperGrok token refresh (DefaultExecutor)", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("refreshCredentials with valid refreshToken returns tokens", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 7200,
      }),
    });

    const { DefaultExecutor } = await import("../../open-sse/executors/default.ts");
    const executor = new DefaultExecutor("xai");

    const result = await executor.refreshCredentials(
      { refreshToken: "old-refresh-token" },
      { info: vi.fn() }
    );

    expect(result).toEqual({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 7200,
    });

    // Verify the fetch was called with correct params
    expect(mockFetch).toHaveBeenCalledWith(
      "https://auth.x.ai/oauth2/token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
        }),
      })
    );

    const fetchCall = mockFetch.mock.calls[0];
    const body = fetchCall[1].body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-refresh-token");
    expect(body.get("client_id")).toBe("b1a00492-073a-47ea-816f-4c329264a828");
  });

  it("refreshCredentials with failed refresh returns null", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("invalid_grant"),
    });

    const { DefaultExecutor } = await import("../../open-sse/executors/default.ts");
    const executor = new DefaultExecutor("xai");

    const result = await executor.refreshCredentials(
      { refreshToken: "expired-token" },
      { info: vi.fn(), error: vi.fn() }
    );

    expect(result).toBeNull();
  });

  it("refreshCredentials without refreshToken returns null", async () => {
    const { DefaultExecutor } = await import("../../open-sse/executors/default.ts");
    const executor = new DefaultExecutor("xai");

    const result = await executor.refreshCredentials(
      { accessToken: "some-token" },
      { info: vi.fn() }
    );

    expect(result).toBeNull();
    // fetch should NOT have been called
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refreshCredentials preserves old refreshToken when server does not return new one", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: "fresh-access",
        expires_in: 3600,
        // No refresh_token in response
      }),
    });

    const { DefaultExecutor } = await import("../../open-sse/executors/default.ts");
    const executor = new DefaultExecutor("xai");

    const result = await executor.refreshCredentials(
      { refreshToken: "original-refresh" },
      { info: vi.fn() }
    );

    expect(result.accessToken).toBe("fresh-access");
    expect(result.refreshToken).toBe("original-refresh");
    expect(result.expiresIn).toBe(3600);
  });
});

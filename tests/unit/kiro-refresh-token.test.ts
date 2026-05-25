import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

vi.mock("../../open-sse/index.ts", () => ({}));

describe("Kiro refresh token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns unrecoverable_refresh_error when Kiro social refresh reports invalid_grant", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: { code: "invalid_grant" } })),
    });

    const { refreshKiroToken } = await import("../../open-sse/services/tokenRefresh.ts");
    const result = await refreshKiroToken("old-refresh-token", { authMethod: "google" }, null);

    expect(result).toEqual({ error: "unrecoverable_refresh_error", code: "invalid_grant" });
  });

  it("uses the configured region for IDC refresh and preserves rotated refresh tokens", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        accessToken: "new-access",
        refreshToken: "rotated-refresh-token",
        expiresIn: 3600,
      }),
    });

    const { refreshKiroToken } = await import("../../open-sse/services/tokenRefresh.ts");
    const result = await refreshKiroToken(
      "old-refresh-token",
      {
        authMethod: "idc",
        clientId: "client-id",
        clientSecret: "client-secret",
        region: "eu-west-1",
      },
      null
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://oidc.eu-west-1.amazonaws.com/token",
      expect.objectContaining({ method: "POST" })
    );
    expect(result).toEqual({
      accessToken: "new-access",
      refreshToken: "rotated-refresh-token",
      expiresIn: 3600,
    });
  });

  it("falls back to us-east-1 for builder-id refresh when region is absent", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        accessToken: "new-access",
        expiresIn: 3600,
      }),
    });

    const { refreshKiroToken } = await import("../../open-sse/services/tokenRefresh.ts");
    const result = await refreshKiroToken(
      "old-refresh-token",
      {
        authMethod: "builder-id",
        clientId: "client-id",
        clientSecret: "client-secret",
      },
      null
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://oidc.us-east-1.amazonaws.com/token",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.refreshToken).toBe("old-refresh-token");
  });
});

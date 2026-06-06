import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Amazon Q provider parity", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("registers Amazon Q as a free provider with AQ alias", async () => {
    const { FREE_PROVIDERS, USAGE_SUPPORTED_PROVIDERS, resolveProviderId } = await import("../../src/shared/constants/providers.ts");

    expect(FREE_PROVIDERS["amazon-q"]).toMatchObject({
      id: "amazon-q",
      alias: "aq",
      name: "Amazon Q",
      color: "#FF9900",
    });
    expect(USAGE_SUPPORTED_PROVIDERS).toContain("amazon-q");
    expect(resolveProviderId("aq")).toBe("amazon-q");
  });

  it("registers Amazon Q specialized executor and model alias mapping", async () => {
    const { getExecutor } = await import("../../open-sse/executors/index.ts");
    const { PROVIDER_ID_TO_ALIAS } = await import("../../open-sse/config/providerModels.ts");

    const executor = getExecutor("amazon-q");

    expect(executor.constructor.name).toBe("KiroExecutor");
    expect(PROVIDER_ID_TO_ALIAS["amazon-q"]).toBe("aq");
  }, 15000);

  it("reuses Kiro OAuth provider implementation for Amazon Q", async () => {
    const { getProvider } = await import("../../src/lib/oauth/providers.ts");

    const kiro = getProvider("kiro");
    const amazonQ = getProvider("amazon-q");

    expect(amazonQ.flowType).toBe("device_code");
    expect(typeof amazonQ.requestDeviceCode).toBe("function");
    expect(typeof amazonQ.pollToken).toBe("function");
    expect(amazonQ.mapTokens({ access_token: "a.b.c", refresh_token: "r", expires_in: 1, _region: "us-east-1" })).toMatchObject({
      providerSpecificData: expect.objectContaining({
        region: "us-east-1",
      }),
    });
    expect(typeof kiro.requestDeviceCode).toBe("function");
  });

  it("reuses Kiro usage and refresh handlers for Amazon Q", async () => {
    const { getUsageForProvider } = await import("../../open-sse/services/usage.ts");
    const { refreshTokenByProvider } = await import("../../open-sse/services/tokenRefresh.ts");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes("getUsageLimits")) {
        return { ok: false, status: 401, text: async () => "unauthorized" };
      }
      return {
        ok: true,
        json: async () => ({ accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 3600 }),
      };
    });

    const usage = await getUsageForProvider({ provider: "amazon-q", accessToken: "token", providerSpecificData: {} });
    const refresh = await refreshTokenByProvider("amazon-q", {
      refreshToken: "refresh",
      providerSpecificData: { authMethod: "google" },
    }, null);

    expect(usage).toEqual({
      message: "Kiro connected. Profile ARN not available for quota tracking.",
      quotas: {},
    });
    expect(refresh).toEqual({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresIn: 3600,
    });

    globalThis.fetch = originalFetch;
  });
});

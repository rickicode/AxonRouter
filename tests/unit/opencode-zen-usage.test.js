import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getUsageForProvider } from "../../open-sse/services/usage.js";
import {
  USAGE_APIKEY_PROVIDERS,
  USAGE_SUPPORTED_PROVIDERS,
} from "../../src/shared/constants/providers.js";
import REGISTRY from "../../open-sse/providers/registry/index.js";

const USAGE_URL = "https://opencode.ai/zen/v1/usage";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenCode Zen registry usage flags", () => {
  it("exposes the quota endpoint as transport.usage url", () => {
    const entry = REGISTRY.find((r) => r.id === "opencode-zen");
    expect(entry.transport.usage.url).toBe(USAGE_URL);
  });

  it("is listed for the API key quota dashboard", () => {
    expect(USAGE_SUPPORTED_PROVIDERS).toContain("opencode-zen");
    expect(USAGE_APIKEY_PROVIDERS).toContain("opencode-zen");
  });
});

describe("getUsageForProvider(opencode-zen)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches and normalizes the rolling/weekly/monthly windows", async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      jsonResponse({
        usage: {
          rolling: { status: "ok", percent: 13, resetsAt: "2026-09-04T14:28:02.617Z" },
          weekly: { status: "ok", percent: 5, resetsAt: "2026-09-07T00:00:00.617Z" },
          monthly: { status: "ok", percent: 2, resetsAt: "2026-10-02T12:14:24.617Z" },
        },
      }),
    );

    const usage = await getUsageForProvider({
      provider: "opencode-zen",
      apiKey: "sk-zen-test",
    });

    expect(proxyAwareFetch).toHaveBeenCalledWith(
      USAGE_URL,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer sk-zen-test" }),
      }),
      null,
    );
    expect(usage).toEqual({
      plan: "OpenCode Zen",
      quotas: {
        Rolling: {
          used: 13,
          total: 100,
          remaining: 87,
          remainingPercentage: 87,
          resetAt: "2026-09-04T14:28:02.617Z",
          unlimited: false,
        },
        Weekly: expect.objectContaining({ used: 5, remainingPercentage: 95 }),
        Monthly: expect.objectContaining({ used: 2, remainingPercentage: 98 }),
      },
    });
  });

  it("asks for a key when none is configured", async () => {
    const usage = await getUsageForProvider({ provider: "opencode-zen", apiKey: null });
    expect(usage.message).toMatch(/API key not available/);
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it("surfaces a re-login hint on 401", async () => {
    proxyAwareFetch.mockResolvedValueOnce(jsonResponse({}, 401));
    const usage = await getUsageForProvider({ provider: "opencode-zen", apiKey: "sk-x" });
    expect(usage.message).toMatch(/authentication failed/i);
  });

  it("names billing when 403 carries an EntitlementError", async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      jsonResponse({ error: { type: "EntitlementError" } }, 403),
    );
    const usage = await getUsageForProvider({ provider: "opencode-zen", apiKey: "sk-x" });
    expect(usage.message).toMatch(/billing required/i);
  });

  it("reports a message when the response carries no quota data", async () => {
    proxyAwareFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const usage = await getUsageForProvider({ provider: "opencode-zen", apiKey: "sk-x" });
    expect(usage.message).toMatch(/did not contain quota data/i);
  });

  it("never throws when the fetch fails", async () => {
    proxyAwareFetch.mockRejectedValueOnce(new Error("socket hang up"));
    const usage = await getUsageForProvider({ provider: "opencode-zen", apiKey: "sk-x" });
    expect(usage.message).toMatch(/socket hang up/);
  });
});
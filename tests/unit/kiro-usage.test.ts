import { afterEach, describe, expect, it, vi } from "vitest";

import { getUsageForProvider } from "../../open-sse/services/usage.ts";
import { getUsageStatusUpdates } from "../../src/lib/usageStatus.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Kiro usage fetching", () => {
  it("returns a profile-arn guidance message instead of inventing a placeholder ARN", async () => {
    const fetchSpy = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getUsageForProvider({
      provider: "kiro",
      accessToken: "token",
      providerSpecificData: {},
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      message: "Kiro connected. Profile ARN not available for quota tracking.",
      quotas: {},
    });
  });

  it("still tries profile-arn-based fallback endpoints when profileArn exists", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getUsageForProvider({
      provider: "kiro",
      accessToken: "token",
      providerSpecificData: { profileArn: "arn:aws:codewhisperer:us-east-1:123:profile/test" },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[1][0])).toBe("https://codewhisperer.us-east-1.amazonaws.com");
    expect(String(fetchSpy.mock.calls[2][0])).toContain("https://q.us-east-1.amazonaws.com/getUsageLimits?");
    expect(result).toEqual({
      message: "Kiro quota API rejected the current token. Chat may still work.",
      quotas: {},
    });
  });

  it("includes raw bucket audit metadata in Kiro usage snapshots", async () => {
    const responsePayload = {
      subscriptionInfo: { subscriptionTitle: "Kiro Pro" },
      nextDateReset: "2026-06-01T00:00:00Z",
      usageBreakdownList: [
        {
          resourceType: "AGENTIC_REQUEST",
          currentUsageWithPrecision: 5,
          usageLimitWithPrecision: 50,
          freeTrialInfo: {
            currentUsageWithPrecision: 50,
            usageLimitWithPrecision: 50,
            freeTrialExpiry: "2026-05-28T00:00:00Z",
          },
        },
      ],
    };
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getUsageForProvider({
      provider: "kiro",
      accessToken: "token",
      providerSpecificData: {},
    });

    expect(result).toMatchObject({
      plan: "Kiro Pro",
      quotaBucketAudit: {
        bucketNames: ["agentic_request", "agentic_request_freetrial"],
        ignoredForRouting: ["agentic_request_freetrial"],
        usageBreakdown: [
          {
            name: "agentic_request",
            hasFreeTrial: true,
          },
        ],
      },
    });
  });
});

describe("Kiro quota routing", () => {
  const baseConnection = {
    id: "kiro-1",
    provider: "kiro",
    providerSpecificData: {},
  };

  it("ignores exhausted freetrial buckets when paid quota still has room", () => {
    const result = getUsageStatusUpdates(baseConnection, {
      quotas: {
        agentic_request: {
          used: 5,
          total: 50,
          remaining: 45,
          resetAt: "2026-06-01T00:00:00.000Z",
        },
        agentic_request_freetrial: {
          used: 50,
          total: 50,
          remaining: 0,
          resetAt: "2026-05-28T00:00:00.000Z",
        },
      },
    });

    expect(result).toMatchObject({
      routingStatus: "eligible",
      quotaState: "ok",
      reasonCode: null,
      resetAt: null,
      nextRetryAt: null,
    });
  });

  it("ignores freetrial threshold hits when primary quota remains healthy", () => {
    const result = getUsageStatusUpdates(baseConnection, {
      quotas: {
        agentic_request: {
          used: 5,
          total: 50,
          remaining: 45,
          resetAt: "2026-06-01T00:00:00.000Z",
        },
        agentic_request_freetrial: {
          used: 46,
          total: 50,
          remaining: 4,
          resetAt: "2026-05-28T00:00:00.000Z",
        },
      },
    });

    expect(result).toMatchObject({
      routingStatus: "eligible",
      quotaState: "ok",
      reasonCode: null,
      resetAt: null,
      nextRetryAt: null,
    });
  });

  it("still exhausts when the main Kiro quota is actually depleted", () => {
    const result = getUsageStatusUpdates(baseConnection, {
      quotas: {
        agentic_request: {
          used: 50,
          total: 50,
          remaining: 0,
          resetAt: "2026-06-01T00:00:00.000Z",
        },
        agentic_request_freetrial: {
          used: 0,
          total: 50,
          remaining: 50,
          resetAt: "2026-05-28T00:00:00.000Z",
        },
      },
    });

    expect(result).toMatchObject({
      routingStatus: "exhausted",
      quotaState: "exhausted",
      reasonCode: "quota_exhausted",
      reasonDetail: "Kiro quota exhausted",
      resetAt: "2026-06-01T00:00:00.000Z",
      nextRetryAt: "2026-06-01T00:00:00.000Z",
    });
  });

  it("still triggers threshold when the main Kiro quota drops below the configured floor", () => {
    const result = getUsageStatusUpdates(baseConnection, {
      quotas: {
        agentic_request: {
          used: 46,
          total: 50,
          remaining: 4,
          resetAt: "2026-06-01T00:00:00.000Z",
        },
        agentic_request_freetrial: {
          used: 0,
          total: 50,
          remaining: 50,
          resetAt: "2026-05-28T00:00:00.000Z",
        },
      },
    });

    expect(result).toMatchObject({
      routingStatus: "exhausted",
      quotaState: "exhausted",
      reasonCode: "quota_threshold",
      reasonDetail: "Kiro remaining quota is at or below 10%",
      resetAt: "2026-06-01T00:00:00.000Z",
      nextRetryAt: "2026-06-01T00:00:00.000Z",
    });
  });
});

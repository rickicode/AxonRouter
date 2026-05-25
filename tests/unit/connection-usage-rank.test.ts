import { describe, expect, it } from "vitest";
import { compareConnectionsByUsageAvailability, getConnectionUsageAvailabilityScore, isConnectionRoutingOrderLockActive } from "../../src/lib/connectionUsageRank";
import { rankConnectionsForPolicy } from "../../src/lib/routing/profilePolicy";

describe("connection usage availability ranking", () => {
  it("ranks quota snapshots by highest remaining quota", () => {
    const low = { id: "low", priority: 1, usageSnapshot: JSON.stringify({ quotas: { weekly: { remaining: 20, total: 100 } } }) };
    const high = { id: "high", priority: 2, usageSnapshot: JSON.stringify({ quotas: { weekly: { remaining: 80, total: 100 } } }) };

    expect([low, high].sort(compareConnectionsByUsageAvailability).map((connection) => connection.id)).toEqual(["high", "low"]);
  });

  it("prefers credit balance over quota percentage when credit data exists", () => {
    const connection = {
      usageSnapshot: JSON.stringify({
        credits: { remaining: 42 },
        quotas: { weekly: { remaining: 99, total: 100 } },
      }),
    };

    expect(getConnectionUsageAvailabilityScore(connection)).toBe(42);
  });

  it("falls back to manual priority when usage data is unavailable", () => {
    const first = { id: "first", priority: 1 };
    const second = { id: "second", priority: 2 };

    expect([second, first].sort(compareConnectionsByUsageAvailability).map((connection) => connection.id)).toEqual(["first", "second"]);
  });

  it("feeds routing policy ranking with relative remaining usage availability", () => {
    const ranked = rankConnectionsForPolicy([
      { id: "manual-first", priority: 1, healthStatus: "healthy", usageSnapshot: JSON.stringify({ credits: { remaining: 500 } }) },
      { id: "more-remaining", priority: 2, healthStatus: "healthy", usageSnapshot: JSON.stringify({ credits: { remaining: 100000 } }) },
    ], { objectives: { cost: 0.6, latency: 0.2, quality: 0.2 } });

    expect(ranked[0].id).toBe("more-remaining");
    expect(ranked[0].routingScoreBreakdown.cost).toBe(1);
    expect(ranked[1].routingScoreBreakdown.cost).toBeCloseTo(0.005, 3);
  });

  it("puts active locked routing orders before usage availability", () => {
    const locked = {
      id: "locked",
      isActive: true,
      authType: "apikey",
      routingStatus: "eligible",
      providerSpecificData: { routingOrderLocked: true, routingOrder: 2 },
      usageSnapshot: JSON.stringify({ credits: { remaining: 10 } }),
    };
    const moreAvailable = {
      id: "more-available",
      isActive: true,
      authType: "apikey",
      routingStatus: "eligible",
      usageSnapshot: JSON.stringify({ credits: { remaining: 1000 } }),
    };

    expect(isConnectionRoutingOrderLockActive(locked)).toBe(true);
    expect([moreAvailable, locked].sort(compareConnectionsByUsageAvailability).map((connection) => connection.id)).toEqual(["locked", "more-available"]);
  });

  it("ignores locked routing orders when the account is exhausted", () => {
    const exhaustedLocked = {
      id: "exhausted-locked",
      isActive: true,
      authType: "apikey",
      quotaState: "exhausted",
      providerSpecificData: { routingOrderLocked: true, routingOrder: 1 },
      usageSnapshot: JSON.stringify({ credits: { remaining: 0 } }),
    };
    const available = {
      id: "available",
      isActive: true,
      authType: "apikey",
      routingStatus: "eligible",
      usageSnapshot: JSON.stringify({ credits: { remaining: 10 } }),
    };

    expect(isConnectionRoutingOrderLockActive(exhaustedLocked)).toBe(false);
    expect([exhaustedLocked, available].sort(compareConnectionsByUsageAvailability).map((connection) => connection.id)).toEqual(["available", "exhausted-locked"]);
  });

  it("uses active locked routing orders in routing policy ranking", () => {
    const ranked = rankConnectionsForPolicy([
      {
        id: "auto-high",
        isActive: true,
        authType: "apikey",
        routingStatus: "eligible",
        healthStatus: "healthy",
        usageSnapshot: JSON.stringify({ credits: { remaining: 1000 } }),
      },
      {
        id: "locked-low",
        isActive: true,
        authType: "apikey",
        routingStatus: "eligible",
        healthStatus: "healthy",
        providerSpecificData: { routingOrderLocked: true, routingOrder: 1 },
        usageSnapshot: JSON.stringify({ credits: { remaining: 1 } }),
      },
    ], { objectives: { cost: 0.6, latency: 0.2, quality: 0.2 } });

    expect(ranked[0].id).toBe("locked-low");
  });
});

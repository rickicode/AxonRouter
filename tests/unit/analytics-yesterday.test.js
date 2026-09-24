import { describe, expect, it } from "vitest";
import {
  getYesterdayFilters,
  calculateComparison,
  mergeYesterdayTimeline,
  analyticsUrl,
} from "../../src/app/(dashboard)/dashboard/usage/components/analyticsData.js";

const NOW = new Date("2026-09-10T11:00:00.000Z");

describe("getYesterdayFilters", () => {
  it("computes exactly 24 hours back for 'today'", () => {
    const filters = getYesterdayFilters({ period: "today" }, NOW);
    expect(filters.timeBucket).toBe("1 minute");
    // Start of today is 00:00:00 of 2026-09-10 -> yesterday start is 00:00:00 of 2026-09-09
    const expectedStart = new Date(NOW);
    expectedStart.setHours(0, 0, 0, 0);
    const expectedYesterdayStart = new Date(expectedStart.getTime() - 86400000);
    expect(filters.timeFrom).toBe(expectedYesterdayStart.toISOString());
    // Yesterday end is same time yesterday (11:00:00 of 2026-09-09)
    const expectedYesterdayEnd = new Date(NOW.getTime() - 86400000);
    expect(filters.timeTo).toBe(expectedYesterdayEnd.toISOString());
  });

  it("shifts 24 hours back for '24h'", () => {
    const filters = getYesterdayFilters({ period: "24h" }, NOW);
    const expectedYesterdayEnd = new Date(NOW.getTime() - 86400000);
    const expectedYesterdayStart = new Date(NOW.getTime() - 2 * 86400000);
    expect(filters.timeTo).toBe(expectedYesterdayEnd.toISOString());
    expect(filters.timeFrom).toBe(expectedYesterdayStart.toISOString());
  });

  it("preserves explicit timeFrom and timeTo shifted by 24h", () => {
    const customFrom = "2026-09-08T10:00:00.000Z";
    const customTo = "2026-09-08T18:00:00.000Z";
    const filters = getYesterdayFilters(
      { timeFrom: customFrom, timeTo: customTo },
      NOW,
    );
    expect(filters.timeFrom).toBe("2026-09-07T10:00:00.000Z");
    expect(filters.timeTo).toBe("2026-09-07T18:00:00.000Z");
  });

  it("preserves provider, model and errorCategory filters", () => {
    const filters = getYesterdayFilters(
      {
        period: "today",
        provider: "cbai",
        model: "glm-5.3",
        errorCategory: "auth",
      },
      NOW,
    );
    expect(filters.provider).toBe("cbai");
    expect(filters.model).toBe("glm-5.3");
    expect(filters.errorCategory).toBe("auth");
  });
});

describe("calculateComparison", () => {
  it("returns null if either summary is missing", () => {
    expect(calculateComparison(null, {})).toBeNull();
    expect(calculateComparison({}, null)).toBeNull();
  });

  it("calculates percentage and absolute diffs correctly", () => {
    const current = {
      totalEvents: 120,
      successRate: 95.0,
      failureCount: 6,
      p50LatencyMs: 250,
      totalInputTokens: 5000,
      totalOutputTokens: 2000,
    };
    const yesterday = {
      totalEvents: 100,
      successRate: 90.0,
      failureCount: 10,
      p50LatencyMs: 300,
      totalInputTokens: 4000,
      totalOutputTokens: 1000,
    };

    const comp = calculateComparison(current, yesterday);
    expect(comp.totalEvents.diff).toBe(20);
    expect(comp.totalEvents.pct).toBe(20);
    expect(comp.successRate.diff).toBe(5.0);
    expect(comp.failureCount.diff).toBe(-4);
    expect(comp.failureCount.pct).toBe(-40);
    expect(comp.p50LatencyMs.diff).toBe(-50);
    expect(comp.totalTokens.diff).toBe(2000);
    expect(comp.totalTokens.pct).toBe(40);
  });
});

describe("mergeYesterdayTimeline", () => {
  it("aligns yesterday bucket to today timestamp via 24h shift", () => {
    const t0 = new Date("2026-09-10T10:00:00.000Z").getTime();
    const yesterdayT0 = t0 - 86400000;

    const currentSeries = [
      {
        bucketMs: t0,
        timestamp: "10:00",
        requests: 50,
        successes: 45,
        failures: 5,
        successRate: 0.9,
        latencyMs: 150,
      },
    ];

    const yesterdaySeries = [
      {
        bucketMs: yesterdayT0,
        timestamp: "10:00 (yesterday)",
        requests: 30,
        successes: 28,
        failures: 2,
        successRate: 0.93,
        latencyMs: 180,
      },
    ];

    const merged = mergeYesterdayTimeline(currentSeries, yesterdaySeries);
    expect(merged).toHaveLength(1);
    expect(merged[0].yesterdayRequests).toBe(30);
    expect(merged[0].yesterdaySuccesses).toBe(28);
    expect(merged[0].yesterdayFailures).toBe(2);
    expect(merged[0].yesterdayLatencyMs).toBe(180);
    expect(merged[0].yesterdaySuccessRate).toBe(0.93);
  });

  it("handles empty or missing yesterday series gracefully with 0 defaults", () => {
    const currentSeries = [
      {
        bucketMs: 12345678,
        requests: 10,
      },
    ];
    const merged = mergeYesterdayTimeline(currentSeries, []);
    expect(merged[0].yesterdayRequests).toBe(0);
    expect(merged[0].yesterdayTokens).toBe(0);
    expect(merged[0].yesterdaySuccessRate).toBeNull();
  });
});

describe("analyticsUrl with direct timeFrom / timeTo", () => {
  it("builds query with explicit time range", () => {
    const url = analyticsUrl({
      timeFrom: "2026-09-09T00:00:00.000Z",
      timeTo: "2026-09-09T12:00:00.000Z",
      timeBucket: "5 minutes",
      provider: "kiro",
    });
    const parsed = new URL(url, "http://localhost");
    expect(parsed.searchParams.get("timeFrom")).toBe("2026-09-09T00:00:00.000Z");
    expect(parsed.searchParams.get("timeTo")).toBe("2026-09-09T12:00:00.000Z");
    expect(parsed.searchParams.get("timeBucket")).toBe("5 minutes");
    expect(parsed.searchParams.get("provider")).toBe("kiro");
  });
});

import { describe, expect, it } from "vitest";
import {
  TIME_BUCKETS,
  defaultTimeBucket,
  analyticsUrl,
} from "../../src/app/(dashboard)/dashboard/usage/components/analyticsData.js";

const NOW = new Date("2026-09-10T04:00:00+07:00");

describe("defaultTimeBucket", () => {
  it("prefers the finest bucket within the 2200-bucket API ceiling", () => {
    expect(defaultTimeBucket("24h", NOW)).toBe("1 minute");
    expect(defaultTimeBucket("today", NOW)).toBe("1 minute");
  });

  it("degrades to coarser buckets as the period grows", () => {
    // 7d = 2016 five-minute buckets -> still within the 2200 ceiling
    expect(defaultTimeBucket("7d", NOW)).toBe("5 minutes");
    // 30d = 720 hours -> 1h fits (720 <= 2200)
    expect(defaultTimeBucket("30d", NOW)).toBe("1 hour");
    // 60d = 1440 hours -> still fits 1h
    expect(defaultTimeBucket("60d", NOW)).toBe("1 hour");
  });

  it("treats unknown periods as 7d (2016 five-minute buckets)", () => {
    // "90d" is not in the period map -> falls back to the 7d span.
    expect(defaultTimeBucket("90d", NOW)).toBe("5 minutes");
  });
});

describe("analyticsUrl timeBucket param", () => {
  const url = (filters) => analyticsUrl(filters, NOW);

  it("uses defaultTimeBucket when no explicit bucket is set", () => {
    const parsed = new URL(url({ period: "7d" }), "http://x");
    expect(parsed.searchParams.get("timeBucket")).toBe("5 minutes");
  });

  it("passes an explicit bucket through", () => {
    const parsed = new URL(url({ period: "24h", timeBucket: "1 minute" }), "http://x");
    expect(parsed.searchParams.get("timeBucket")).toBe("1 minute");
    expect(parsed.searchParams.get("timeFrom")).toBe(
      new Date(NOW.getTime() - 86400000).toISOString(),
    );
  });

  it("keeps provider/model/errorCategory filters", () => {
    const parsed = new URL(
      url({ period: "24h", provider: "cbai", model: "glm-5.3", errorCategory: "auth" }),
      "http://x",
    );
    expect(parsed.searchParams.get("provider")).toBe("cbai");
    expect(parsed.searchParams.get("model")).toBe("glm-5.3");
    expect(parsed.searchParams.get("errorCategory")).toBe("auth");
  });

  it("lists the four API-valid buckets in selector order", () => {
    expect(TIME_BUCKETS.map((b) => b.value)).toEqual([
      "1 minute",
      "5 minutes",
      "1 hour",
      "1 day",
    ]);
  });
});

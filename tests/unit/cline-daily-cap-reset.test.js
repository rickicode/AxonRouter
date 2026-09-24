import { describe, expect, it } from "vitest";
import { extractQuotaResetMs } from "../../open-sse/utils/error.js";

const fakeResponse = { headers: { get: () => null }, status: 429 };

describe("extractQuotaResetMs — Cline 'Try again in' daily-cap messages", () => {
  it("parses Cline 429 'Try again in 8h 26m' into ~8.4h reset", () => {
    const body = JSON.stringify({
      error: {
        message: "Error 429: Daily free limit reached on model z-ai/glm-5.3-flash. Try again in 8h 26m",
      },
    });
    const now = Date.now();
    const ms = extractQuotaResetMs(body, fakeResponse);
    expect(ms).toBeGreaterThan(now + 8 * 3600 * 1000);
    expect(ms).toBeLessThan(now + 9 * 3600 * 1000);
  });

  it("parses 'Try again in 8h 47m' variant", () => {
    const body = JSON.stringify({
      error: { message: "Daily free limit reached. Try again in 8h 47m" },
    });
    const ms = extractQuotaResetMs(body, fakeResponse);
    expect(ms).toBeGreaterThan(Date.now() + 8 * 3600 * 1000);
  });

  it("does not swallow 'resets in' messages (existing behavior)", () => {
    const body = JSON.stringify({ error: { message: "Resets in 166h22m46s" } });
    const ms = extractQuotaResetMs(body, fakeResponse);
    expect(ms).toBeGreaterThan(Date.now() + 100 * 3600 * 1000);
  });

  it("returns null when no reset hint present", () => {
    const ms = extractQuotaResetMs("quota exceeded, no hint", fakeResponse);
    expect(ms).toBeNull();
  });

  it("parses minute/second granularity via 'Try again in N minutes'", () => {
    const body = JSON.stringify({
      error: { message: "Rate limited. Try again in 30 minutes" },
    });
    const now = Date.now();
    const ms = extractQuotaResetMs(body, fakeResponse);
    expect(ms).toBeGreaterThan(now + 29 * 60 * 1000);
    expect(ms).toBeLessThan(now + 31 * 60 * 1000);
  });
});

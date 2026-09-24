import { describe, expect, it } from "vitest";
import { extractQuotaResetMs } from "../../open-sse/utils/error.js";

const fakeResponse = { headers: { get: () => null }, status: 429 };

// Mirrors the universal-429 branch in src/sse/services/auth.js: when a
// daily-cap 429 has a precise upstream reset ("Try again in N"), the precise
// value wins; without one, the matched rule's conservative cooldown (24h)
// must beat the 30-minute default instead of being discarded.
function cooldownFor({ errorText, resetsAtMs, ruleCooldownMs }) {
  const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;
  const isDailyCap429 = /daily|limit reached|try again in \d+h|individual quota|exhausted.*capacity|quota.*r[e\i]set|quota.*reset/i
    .test(String(errorText || "").toLowerCase());
  return resetsAtMs && resetsAtMs > Date.now()
    ? resetsAtMs - Date.now()
    : Math.max(DEFAULT_RATE_LIMIT_COOLDOWN_MS, isDailyCap429 ? (ruleCooldownMs || 0) : 0);
}

describe("daily-cap 429 cooldown resolution", () => {
  it("uses the precise 'Try again in 8h 23m' reset when present", () => {
    const resetsAtMs = extractQuotaResetMs(
      JSON.stringify({ error: { message: "Daily free limit reached. Try again in 8h 23m" } }),
      fakeResponse,
    );
    const cooldown = cooldownFor({ errorText: "Daily free limit reached", resetsAtMs, ruleCooldownMs: 24 * 3600 * 1000 });
    expect(cooldown).toBeGreaterThan(8 * 3600 * 1000);
    expect(cooldown).toBeLessThan(9 * 3600 * 1000);
  });

  it("falls back to the rule's 24h cooldown when no reset hint exists", () => {
    const resetsAtMs = extractQuotaResetMs("quota exceeded", fakeResponse);
    expect(resetsAtMs).toBeNull();
    const cooldown = cooldownFor({ errorText: "daily free limit reached on model x", resetsAtMs: null, ruleCooldownMs: 24 * 3600 * 1000 });
    expect(cooldown).toBe(24 * 3600 * 1000);
  });

  it("keeps the 30-minute default for non-daily 429s without a reset", () => {
    const cooldown = cooldownFor({ errorText: "too many requests", resetsAtMs: null, ruleCooldownMs: 0 });
    expect(cooldown).toBe(30 * 60 * 1000);
  });
  it("keeps the Grok free-usage 24h exhaustion cooldown over the 30-minute default", () => {
    const isGrokFreeExhausted = true;
    const isCodebuddyThrottle = false;
    const isCodebuddyCreditExhausted = false;
    const isBaiThrottle = false;
    const isClineFreeThrottle = false;
    const resetsAtMs = null;
    let cooldownMs = 24 * 3600 * 1000;
    const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;
    const isDailyCap429 = false;
    cooldownMs = resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : isCodebuddyThrottle || isCodebuddyCreditExhausted || isBaiThrottle || isClineFreeThrottle || isGrokFreeExhausted
        ? (cooldownMs || 0)
        : Math.max(DEFAULT_RATE_LIMIT_COOLDOWN_MS, isDailyCap429 ? (cooldownMs || 0) : 0);
    expect(cooldownMs).toBe(24 * 3600 * 1000);
  });
});

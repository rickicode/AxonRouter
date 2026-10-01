// Regression: 426 Upgrade Required had no rule, so it fell through to the final
// shouldFallback:false in checkFallbackError and the request died on the FIRST
// combo member without rotating. Observed with grok-cli ("version 0.2.99 is
// outdated, update to 1.0.13 or later") across two different accounts in 0.45s.
//
// 426 is a client-build/session gate, not a request error and not a dead
// credential: the correct behaviour is to fall back to the next account or combo
// member and park the session briefly — the same shape as 524.
import { describe, it, expect } from "vitest";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";
import { TRANSIENT_COOLDOWN_MS } from "../../open-sse/config/errorConfig.js";

const msg = "Your Grok CLI version (0.2.99) is outdated. Please update to version 1.0.13 or later via `grok update`.";

describe("426 Upgrade Required", () => {
  it("falls back instead of failing the call on the first member", () => {
    const r = checkFallbackError(426, msg);
    expect(r.shouldFallback).toBe(true);
  });

  it("parks the session briefly without locking or disabling the account", () => {
    const r = checkFallbackError(426, msg);
    expect(r.cooldownMs).toBeGreaterThan(0);
    expect(r.cooldownMs).toBeLessThanOrEqual(TRANSIENT_COOLDOWN_MS);
    expect(r.lockAll).toBeFalsy();
    expect(r.disableAccount).toBeFalsy();
  });

  it("still treats 400/404/413/499 as request-level and non-fallback", () => {
    for (const s of [400, 404, 413, 499]) {
      expect(checkFallbackError(s, "bad request").shouldFallback, `status ${s}`).toBe(false);
    }
  });

  it("does not disable the account — a session that passes the gate can still use it", () => {
    expect(checkFallbackError(426, msg).disableAccount).toBeFalsy();
  });
});

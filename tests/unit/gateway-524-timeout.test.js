import { describe, expect, it } from "vitest";
import { checkFallbackError, isFatalAuthError } from "../../open-sse/services/accountFallback.js";

describe("HTTP 524 Gateway Timeout handling", () => {
  it("treats 524 status as transient fallback without account lock or cooldown", () => {
    const res = checkFallbackError(524, "Gateway Timeout");
    expect(res.shouldFallback).toBe(true);
    expect(res.cooldownMs).toBe(0);
    expect(res.lockAll).toBe(false);
    expect(res.disableAccount).toBe(false);
  });

  it("treats 524 Cloudflare error text as transient fallback without account lock", () => {
    const res = checkFallbackError(500, "<title>524: A timeout occurred</title>");
    expect(res.shouldFallback).toBe(true);
    expect(res.cooldownMs).toBe(0);
    expect(res.lockAll).toBe(false);
    expect(res.disableAccount).toBe(false);
  });

  it("never classifies 524 timeout as a fatal auth error", () => {
    expect(isFatalAuthError(524, "524 Gateway Timeout")).toBe(false);
    expect(isFatalAuthError(524, "Cloudflare 524 A timeout occurred")).toBe(false);
  });
});

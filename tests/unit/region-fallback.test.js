import { describe, expect, it } from "vitest";
import {
  checkFallbackError,
  isFatalAuthError,
  filterAvailableAccounts,
} from "../../open-sse/services/accountFallback.js";

describe("Region rotation fallback", () => {
  it("triggers fallback on exact JSON payload from Google API", () => {
    const payload = {
      error: {
        code: 400,
        message: "User location is not supported for the API use.",
        status: "FAILED_PRECONDITION",
      },
    };
    const res = checkFallbackError(400, payload);
    expect(res.shouldFallback).toBe(true);
    expect(res.cooldownMs).toBeGreaterThan(0);
    expect(res.lockAll).toBe(false);
    expect(res.disableAccount).toBe(false);
    expect(res.isExhausted).toBe(false);
  });

  it("triggers fallback on wrapped error message string", () => {
    const errorString =
      "Error: 400 Bad Request - User location is not supported for the API use.";
    const res = checkFallbackError(400, errorString);
    expect(res.shouldFallback).toBe(true);
    expect(res.cooldownMs).toBeGreaterThan(0);
    expect(res.disableAccount).toBe(false);
    expect(res.isExhausted).toBe(false);
  });

  it("keeps ordinary malformed request HTTP 400 non-retryable", () => {
    const badRequest = {
      error: {
        code: 400,
        message: "Field 'messages[0].content' is missing or invalid",
        status: "INVALID_ARGUMENT",
      },
    };
    const res = checkFallbackError(400, badRequest);
    expect(res.shouldFallback).toBe(false);
    expect(res.cooldownMs).toBe(0);
    expect(res.disableAccount).toBe(false);
  });

  it("never treats Google unsupported region as fatal auth failure", () => {
    expect(
      isFatalAuthError(400, "User location is not supported for the API use."),
    ).toBe(false);
    expect(
      isFatalAuthError(400, {
        error: { message: "User location is not supported for the API use." },
      }),
    ).toBe(false);
  });

  it("excludes cooled down account and selects next available account", () => {
    const now = Date.now();
    const accounts = [
      {
        id: "acc_google_us_blocked",
        name: "Google Account 1 (Region Blocked)",
        isActive: true,
        testStatus: "active",
        rateLimitedUntil: new Date(now + 60000).toISOString(), // Cooled down
      },
      {
        id: "acc_google_eu_ok",
        name: "Google Account 2 (Healthy)",
        isActive: true,
        testStatus: "active",
        rateLimitedUntil: null,
      },
    ];

    const available = filterAvailableAccounts(accounts);
    expect(available).toHaveLength(1);
    expect(available[0].id).toBe("acc_google_eu_ok");
  });
});

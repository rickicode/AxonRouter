import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	parseRetryAfterHeader,
	resolveProviderProfile,
	checkFallbackError,
	getQuotaCooldown,
} from "open-sse/services/accountFallback";
import { BACKOFF_CONFIG } from "open-sse/config/errorConfig";

describe("parseRetryAfterHeader", () => {
	it("returns null when headers is null/undefined", () => {
		expect(parseRetryAfterHeader(null)).toBeNull();
		expect(parseRetryAfterHeader(undefined)).toBeNull();
	});

	it("parses Retry-After as seconds (integer string)", () => {
		const headers = { "retry-after": "60" };
		const result = parseRetryAfterHeader(headers);
		expect(result).toBe(60000);
	});

	it("parses Retry-After as seconds with value 120", () => {
		const headers = new Headers({ "retry-after": "120" });
		const result = parseRetryAfterHeader(headers);
		expect(result).toBe(120000);
	});

	it("parses Retry-After as HTTP-date (future date)", () => {
		const futureDate = new Date(Date.now() + 300000); // 5 minutes from now
		const headers = { "retry-after": futureDate.toUTCString() };
		const result = parseRetryAfterHeader(headers);
		expect(result).not.toBeNull();
		// Should be approximately 300000ms (allow 5s tolerance for test execution time)
		expect(result!).toBeGreaterThan(295000);
		expect(result!).toBeLessThanOrEqual(300000);
	});

	it("returns null for Retry-After with past date", () => {
		const pastDate = new Date(Date.now() - 60000); // 1 minute ago
		const headers = { "retry-after": pastDate.toUTCString() };
		const result = parseRetryAfterHeader(headers);
		expect(result).toBeNull();
	});

	it("parses X-RateLimit-Reset as seconds timestamp", () => {
		// Use a future timestamp in seconds (e.g. 1800000000 = ~2027)
		const futureTs = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
		const headers = { "x-ratelimit-reset": String(futureTs) };
		const result = parseRetryAfterHeader(headers);
		expect(result).not.toBeNull();
		// Should be approximately 600000ms
		expect(result!).toBeGreaterThan(595000);
		expect(result!).toBeLessThanOrEqual(600000);
	});

	it("parses X-RateLimit-Reset as milliseconds timestamp", () => {
		const futureMs = Date.now() + 900000; // 15 minutes from now (ms timestamp > 10000000000)
		const headers = { "x-ratelimit-reset": String(futureMs) };
		const result = parseRetryAfterHeader(headers);
		expect(result).not.toBeNull();
		// Should be approximately 900000ms
		expect(result!).toBeGreaterThan(895000);
		expect(result!).toBeLessThanOrEqual(900000);
	});

	it("returns null with no relevant headers", () => {
		const headers = { "content-type": "application/json" };
		expect(parseRetryAfterHeader(headers)).toBeNull();
	});

	it("returns null for X-RateLimit-Reset with past timestamp", () => {
		const pastTs = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
		const headers = { "x-ratelimit-reset": String(pastTs) };
		expect(parseRetryAfterHeader(headers)).toBeNull();
	});

	it("works with Headers object (fetch API)", () => {
		const headers = new Headers();
		headers.set("retry-after", "30");
		const result = parseRetryAfterHeader(headers);
		expect(result).toBe(30000);
	});

	it("returns null for Retry-After: 0", () => {
		const headers = { "retry-after": "0" };
		expect(parseRetryAfterHeader(headers)).toBeNull();
	});
});

describe("resolveProviderProfile", () => {
	it("returns defaults from BACKOFF_CONFIG when no stored profile", () => {
		const profile = resolveProviderProfile("nonexistent-provider");
		expect(profile.baseCooldownMs).toBe(BACKOFF_CONFIG.base);
		expect(profile.maxBackoffSteps).toBe(BACKOFF_CONFIG.maxLevel);
		expect(profile.useUpstreamRetryHints).toBe(true);
	});

	it("returns defaults when providerId is undefined", () => {
		const profile = resolveProviderProfile(undefined);
		expect(profile.baseCooldownMs).toBe(BACKOFF_CONFIG.base);
		expect(profile.maxBackoffSteps).toBe(BACKOFF_CONFIG.maxLevel);
		expect(profile.useUpstreamRetryHints).toBe(true);
	});

	it("returns defaults when no providerId given", () => {
		const profile = resolveProviderProfile();
		expect(profile.baseCooldownMs).toBe(BACKOFF_CONFIG.base);
		expect(profile.maxBackoffSteps).toBe(BACKOFF_CONFIG.maxLevel);
	});
});

describe("checkFallbackError with upstream retry headers and provider profiles", () => {
	it("backward compatible: works without options param", () => {
		const result = checkFallbackError(429, "rate limit exceeded", 0);
		expect(result.shouldFallback).toBe(true);
		expect(result.cooldownMs).toBeGreaterThan(0);
		expect(result.newBackoffLevel).toBe(1);
	});

	it("uses parsed Retry-After header cooldown for 429", () => {
		const headers = { "retry-after": "45" };
		const result = checkFallbackError(429, "", 0, { headers });
		expect(result.shouldFallback).toBe(true);
		// Should use the parsed 45000ms cooldown
		expect(result.cooldownMs).toBe(45000);
		expect(result.newBackoffLevel).toBe(1);
	});

	it("uses parsed Retry-After header for text-matched rate limit rule", () => {
		const headers = { "retry-after": "90" };
		const result = checkFallbackError(200, "rate limit reached", 0, { headers });
		expect(result.shouldFallback).toBe(true);
		expect(result.cooldownMs).toBe(90000);
	});

	it("caps parsed cooldown at MAX_RATE_LIMIT_COOLDOWN_MS", () => {
		// 7200 seconds = 2 hours, exceeds the 30-minute cap
		const headers = { "retry-after": "7200" };
		const result = checkFallbackError(429, "", 0, { headers });
		expect(result.shouldFallback).toBe(true);
		// MAX_RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000 = 1800000
		expect(result.cooldownMs).toBe(30 * 60 * 1000);
	});

	it("falls back to exponential backoff when no parseable header", () => {
		const headers = { "content-type": "application/json" };
		const result = checkFallbackError(429, "", 2, { headers });
		expect(result.shouldFallback).toBe(true);
		// Should use standard exponential backoff
		expect(result.cooldownMs).toBe(getQuotaCooldown(3));
		expect(result.newBackoffLevel).toBe(3);
	});

	it("falls back to exponential backoff when headers not provided", () => {
		const result = checkFallbackError(429, "", 2, {});
		expect(result.shouldFallback).toBe(true);
		expect(result.cooldownMs).toBe(getQuotaCooldown(3));
	});

	it("uses custom baseCooldownMs from provider profile via getQuotaCooldown", () => {
		// Without headers, should use profile baseCooldownMs for exponential backoff
		// Since we cannot easily inject provider profiles at runtime in this test,
		// we verify the getQuotaCooldown function directly with custom base
		const customBase = 5000;
		const cooldown = getQuotaCooldown(1, customBase);
		// Level 1: base * 2^0 = 5000
		expect(cooldown).toBe(5000);

		const cooldown2 = getQuotaCooldown(3, customBase);
		// Level 3: base * 2^2 = 20000
		expect(cooldown2).toBe(20000);
	});

	it("getQuotaCooldown uses default base when not specified", () => {
		const cooldown = getQuotaCooldown(1);
		expect(cooldown).toBe(BACKOFF_CONFIG.base);
	});

	it("getQuotaCooldown respects max cap", () => {
		const cooldown = getQuotaCooldown(20, 5000);
		expect(cooldown).toBe(BACKOFF_CONFIG.max);
	});

	it("non-backoff rules are not affected by headers", () => {
		const headers = { "retry-after": "300" };
		// Status 401 has a fixed cooldown rule (no backoff)
		const result = checkFallbackError(401, "", 0, { headers });
		expect(result.shouldFallback).toBe(true);
		// Should use the fixed cooldown from the rule, not the Retry-After header
		expect(result.cooldownMs).toBe(2 * 60 * 1000); // COOLDOWN.long = 2 minutes
	});

	it("request validation errors still return shouldFallback false", () => {
		const headers = { "retry-after": "60" };
		const result = checkFallbackError(400, "bad request", 0, { headers });
		expect(result.shouldFallback).toBe(false);
		expect(result.cooldownMs).toBe(0);
	});
});

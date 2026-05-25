import { describe, it, expect } from "vitest";
import {
  getCodexModelScope,
  getCodexRateLimitKey,
  parseCodexQuotaHeaders,
  getCodexDualWindowCooldownMs,
  type CodexQuotaSnapshot,
} from "open-sse/executors/codex";

describe("getCodexModelScope", () => {
  it('returns "codex" for gpt-5.3-codex', () => {
    expect(getCodexModelScope("gpt-5.3-codex")).toBe("codex");
  });

  it('returns "spark" for codex-spark-mini', () => {
    expect(getCodexModelScope("codex-spark-mini")).toBe("spark");
  });

  it('returns "spark" for codex-spark', () => {
    expect(getCodexModelScope("codex-spark")).toBe("spark");
  });

  it('returns "codex" for gpt-5.2-codex-high', () => {
    expect(getCodexModelScope("gpt-5.2-codex-high")).toBe("codex");
  });

  it('returns "spark" for spark-base', () => {
    expect(getCodexModelScope("spark-base")).toBe("spark");
  });

  it('returns "codex" as default for unknown-model', () => {
    expect(getCodexModelScope("unknown-model")).toBe("codex");
  });
});

describe("getCodexRateLimitKey", () => {
  it('returns "connId:codex" for codex models', () => {
    expect(getCodexRateLimitKey("connId", "gpt-5.3-codex")).toBe("connId:codex");
  });

  it('returns "connId:spark" for spark models', () => {
    expect(getCodexRateLimitKey("connId", "codex-spark-mini")).toBe("connId:spark");
  });
});

describe("parseCodexQuotaHeaders", () => {
  it("returns full snapshot when all headers present", () => {
    const headers = new Headers({
      "x-codex-5h-usage": "80",
      "x-codex-5h-limit": "100",
      "x-codex-5h-reset-at": "2025-06-01T12:00:00Z",
      "x-codex-7d-usage": "500",
      "x-codex-7d-limit": "1000",
      "x-codex-7d-reset-at": "2025-06-07T00:00:00Z",
    });

    const result = parseCodexQuotaHeaders(headers);
    expect(result).toEqual({
      usage5h: 80,
      limit5h: 100,
      resetAt5h: "2025-06-01T12:00:00Z",
      usage7d: 500,
      limit7d: 1000,
      resetAt7d: "2025-06-07T00:00:00Z",
    });
  });

  it("returns snapshot with defaults when partial headers present", () => {
    const headers = new Headers({
      "x-codex-5h-usage": "50",
      "x-codex-5h-limit": "100",
    });

    const result = parseCodexQuotaHeaders(headers);
    expect(result).not.toBeNull();
    expect(result!.usage5h).toBe(50);
    expect(result!.limit5h).toBe(100);
    expect(result!.resetAt5h).toBeNull();
    expect(result!.usage7d).toBe(0);
    expect(result!.limit7d).toBe(Infinity);
    expect(result!.resetAt7d).toBeNull();
  });

  it("returns null when no relevant headers present", () => {
    const headers = new Headers({
      "content-type": "application/json",
    });

    const result = parseCodexQuotaHeaders(headers);
    expect(result).toBeNull();
  });

  it("works with plain record object", () => {
    const headers: Record<string, string> = {
      "x-codex-5h-usage": "90",
      "x-codex-5h-limit": "100",
      "x-codex-7d-usage": "700",
      "x-codex-7d-limit": "1000",
    };

    const result = parseCodexQuotaHeaders(headers);
    expect(result).not.toBeNull();
    expect(result!.usage5h).toBe(90);
    expect(result!.limit5h).toBe(100);
    expect(result!.usage7d).toBe(700);
    expect(result!.limit7d).toBe(1000);
  });
});

describe("getCodexDualWindowCooldownMs", () => {
  it("returns cooldown to 7d reset when 7d window at 96% usage", () => {
    const futureReset = new Date(Date.now() + 3600_000).toISOString(); // 1 hour from now
    const quota: CodexQuotaSnapshot = {
      usage5h: 50,
      limit5h: 100,
      resetAt5h: null,
      usage7d: 960,
      limit7d: 1000,
      resetAt7d: futureReset,
    };

    const result = getCodexDualWindowCooldownMs(quota);
    expect(result.window).toBe("7d");
    expect(result.cooldownMs).toBeGreaterThan(0);
    expect(result.cooldownMs).toBeLessThanOrEqual(3600_000);
  });

  it("returns cooldown to 5h reset when 5h window at 96% usage", () => {
    const futureReset = new Date(Date.now() + 1800_000).toISOString(); // 30 min from now
    const quota: CodexQuotaSnapshot = {
      usage5h: 96,
      limit5h: 100,
      resetAt5h: futureReset,
      usage7d: 100,
      limit7d: 1000,
      resetAt7d: null,
    };

    const result = getCodexDualWindowCooldownMs(quota);
    expect(result.window).toBe("5h");
    expect(result.cooldownMs).toBeGreaterThan(0);
    expect(result.cooldownMs).toBeLessThanOrEqual(1800_000);
  });

  it("returns {cooldownMs: 0, window: 'none'} when both under threshold", () => {
    const quota: CodexQuotaSnapshot = {
      usage5h: 50,
      limit5h: 100,
      resetAt5h: null,
      usage7d: 500,
      limit7d: 1000,
      resetAt7d: null,
    };

    const result = getCodexDualWindowCooldownMs(quota);
    expect(result).toEqual({ cooldownMs: 0, window: "none" });
  });

  it("7d takes priority over 5h when both exceeded", () => {
    const futureReset7d = new Date(Date.now() + 7200_000).toISOString(); // 2 hours from now
    const futureReset5h = new Date(Date.now() + 1800_000).toISOString(); // 30 min from now
    const quota: CodexQuotaSnapshot = {
      usage5h: 96,
      limit5h: 100,
      resetAt5h: futureReset5h,
      usage7d: 960,
      limit7d: 1000,
      resetAt7d: futureReset7d,
    };

    const result = getCodexDualWindowCooldownMs(quota);
    expect(result.window).toBe("7d");
    expect(result.cooldownMs).toBeGreaterThan(1800_000); // longer than the 5h reset
  });
});

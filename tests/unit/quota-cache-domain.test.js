import { describe, it, expect, beforeEach } from "vitest";
import {
  setQuotaCache, isQuotaExhaustedForRequest, markAccountExhaustedFrom429,
  __clearForTests, getQuotaCache,
} from "@/domain/quotaCache.js";

beforeEach(() => __clearForTests());

describe("quota-cache-domain", () => {
  it("full exhaustion blocks", () => {
    setQuotaCache("c1", "antigravity", {
      gemini_weekly: { remainingPercentage: 0, resetAt: new Date(Date.now() + 3600e3).toISOString() },
      claude_gpt_weekly: { remainingPercentage: 0, resetAt: new Date(Date.now() + 3600e3).toISOString() },
    });
    expect(isQuotaExhaustedForRequest("c1", "antigravity")).toBe(true);
  });
  it("partial exhaustion scopes by family", () => {
    const reset = new Date(Date.now() + 3600e3).toISOString();
    setQuotaCache("c2", "antigravity", {
      gemini_weekly: { remainingPercentage: 0, resetAt: reset },
      claude_gpt_weekly: { remainingPercentage: 80, resetAt: reset },
    });
    expect(isQuotaExhaustedForRequest("c2", "antigravity", "gemini-3.8-flash")).toBe(true);
    expect(isQuotaExhaustedForRequest("c2", "antigravity", "claude-sonnet-4-6")).toBe(false);
  });
  it("unmeasured window never exhausts", () => {
    setQuotaCache("c3", "codex", { weekly: { remainingPercentage: 0, fractionReported: false } });
    expect(isQuotaExhaustedForRequest("c3", "codex")).toBe(false);
  });
  it("auto-advance recovers past reset", () => {
    setQuotaCache("c4", "codex", { weekly: { remainingPercentage: 0, resetAt: new Date(Date.now() - 1000).toISOString() } });
    expect(isQuotaExhaustedForRequest("c4", "codex")).toBe(false);
  });
  it("untimed 429 self-heals after TTL", () => {
    markAccountExhaustedFrom429("c5", "codex");
    expect(isQuotaExhaustedForRequest("c5", "codex")).toBe(true);
    const e = getQuotaCache("c5");
    e.fetchedAt = Date.now() - 6 * 60 * 1000;
    expect(isQuotaExhaustedForRequest("c5", "codex")).toBe(false);
  });
  it("unknown connection is routable", () => {
    expect(isQuotaExhaustedForRequest("nope", "antigravity", "gemini-x")).toBe(false);
  });
});

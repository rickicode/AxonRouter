import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async () => []),
  getApiKeys: vi.fn(async () => []),
  getProviderNodes: vi.fn(async () => []),
  getPricingForModel: vi.fn(async () => null),
}));

describe("usage analytics total token contract", () => {
  let tempDir;

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-analytics-total-token-"));
    process.env.DATA_DIR = tempDir;
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("preserves extended total tokens across summary and breakdowns", async () => {
    const { saveRequestUsage } = await import("../../src/lib/usageDb.ts");
    const { drainUsageQueue } = await import("../../src/lib/usageDb/backgroundQueue.ts");
    const { getUsageAnalyticsFromDb } = await import("../../src/lib/usageDb/queries/analytics.ts");

    await saveRequestUsage({
      timestamp: "2026-04-25T12:00:00.000Z",
      model: "claude-3-5-sonnet",
      provider: "anthropic",
      tokens: {
        prompt_tokens: 0,
        completion_tokens: 0,
        cache_read_input_tokens: 7424,
        total_tokens: 7424,
      },
      cost: 0.1,
    });
    await drainUsageQueue();

    const analytics = getUsageAnalyticsFromDb({ period: "all" });

    expect(analytics.summary.totalRequests).toBe(1);
    expect(analytics.summary.promptTokens).toBe(0);
    expect(analytics.summary.completionTokens).toBe(0);
    expect(analytics.summary.totalTokens).toBe(7424);
    expect(analytics.byProvider).toEqual([
      expect.objectContaining({
        provider: "anthropic",
        totalTokens: 7424,
      }),
    ]);
    expect(analytics.byModel).toEqual([
      expect.objectContaining({
        model: "claude-3-5-sonnet",
        provider: "anthropic",
        totalTokens: 7424,
        pct: "100.0",
      }),
    ]);
    expect(analytics.dailyTrend).toEqual([
      expect.objectContaining({
        date: "2026-04-25",
        totalTokens: 7424,
      }),
    ]);
    expect(analytics.weeklyPattern.reduce((sum, row) => sum + row.totalTokens, 0)).toBe(7424);

  });
});

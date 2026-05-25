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

describe("usage total token contract", () => {
  let tempDir;

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-total-token-"));
    process.env.DATA_DIR = tempDir;
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("preserves provider-reported total_tokens in stats and grouped summaries", async () => {
    const { saveRequestUsage, getUsageStats } = await import("../../src/lib/usageDb.ts");

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

    const stats = await getUsageStats("all");

    expect(stats.totalRequests).toBe(1);
    expect(stats.totalPromptTokens).toBe(0);
    expect(stats.totalCompletionTokens).toBe(0);
    expect(stats.totalTokens).toBe(7424);
    expect(stats.byProvider.anthropic.requests).toBe(1);
    expect(stats.byProvider.anthropic.promptTokens).toBe(0);
    expect(stats.byProvider.anthropic.completionTokens).toBe(0);
    expect(stats.byProvider.anthropic.totalTokens).toBe(7424);
    expect(stats.byModel["claude-3-5-sonnet|anthropic"].totalTokens).toBe(7424);
  });
});

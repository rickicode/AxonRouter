import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderConnections = vi.fn();
const getApiKeys = vi.fn();
const getProviderNodes = vi.fn();
const getMorphUsageStats = vi.fn();

vi.mock("@/lib/localDb", () => ({
  getProviderConnections,
  getApiKeys,
  getProviderNodes,
}));

vi.mock("@/lib/morphUsageDb", () => ({
  getMorphUsageStats,
}));

describe("usage stats merge Morph fast models", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getProviderConnections.mockResolvedValue([]);
    getApiKeys.mockResolvedValue([]);
    getProviderNodes.mockResolvedValue([]);
    getMorphUsageStats.mockResolvedValue({
      byCapability: {
        apply: { requests: 2 },
      },
      byModel: {
        "morph-qwen35-397b": {
          model: "morph-qwen35-397b",
          requests: 2,
          inputTokens: 120,
          outputTokens: 45,
          credits: 25,
        },
      },
      recentRequests: [
        {
          timestamp: "2099-01-01T00:00:00.000Z",
          capability: "apply",
          model: "auto",
          resolvedModel: "morph-qwen35-397b",
          requestedModel: "auto",
          inputTokens: 120,
          outputTokens: 45,
          status: "ok",
        },
      ],
    });
  });

  it("adds Morph fast usage into shared usage stats", async () => {
    const { getUsageStats } = await import("../../src/lib/usageDb.ts");
    const stats = await getUsageStats("7d");

    expect(stats.byProvider["morph-fast"]).toMatchObject({
      requests: expect.any(Number),
      promptTokens: expect.any(Number),
      completionTokens: expect.any(Number),
    });
    expect(stats.byProvider["morph-fast"].requests).toBeGreaterThanOrEqual(2);
    expect(stats.byProvider["morph-fast"].promptTokens).toBeGreaterThanOrEqual(120);
    expect(stats.byProvider["morph-fast"].completionTokens).toBeGreaterThanOrEqual(45);
    expect(stats.byModel["morph-qwen35-397b (morph-fast)"]).toMatchObject({
      rawModel: "morph-qwen35-397b",
      provider: "Morph Fast Models",
      requests: 2,
    });
    const morphRecent = stats.recentRequests.find((entry) => entry?.provider === "morph-fast" || entry?.resolvedModel === "morph-qwen35-397b");
    expect(morphRecent).toMatchObject({
      resolvedModel: "morph-qwen35-397b",
    });
    expect(stats.totalRequests).toBeGreaterThanOrEqual(2);
    expect(stats.totalPromptTokens).toBeGreaterThanOrEqual(120);
    expect(stats.totalCompletionTokens).toBeGreaterThanOrEqual(45);
  });
});

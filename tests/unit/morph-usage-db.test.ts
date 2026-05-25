import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MORPH_CORE_INTERNAL_MODELS } from "../../src/shared/constants/models.ts";

const tempDirs = [];

async function createTempDataDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "axonrouter-morph-usage-"));
  tempDirs.push(dir);
  process.env.DATA_DIR = dir;
  return dir;
}

describe("morph usage pricing", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    await createTempDataDir();
    vi.resetModules();
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.DATA_DIR;
    while (tempDirs.length > 0) {
      await fs.rm(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  it("calculates credits from official Morph pricing", async () => {
    const { calculateMorphCredits } = await import("../../src/lib/morphUsageDb.ts");
    const result = calculateMorphCredits({
      capability: "apply",
      model: MORPH_CORE_INTERNAL_MODELS.applyDefault,
      tokens: { prompt_tokens: 1000, completion_tokens: 500 },
    });

    expect(result.model).toBe(MORPH_CORE_INTERNAL_MODELS.applyDefault);
    expect(result.dollars).toBeCloseTo(0.00185, 8);
    expect(result.credits).toBeCloseTo(185, 5);
  });

  it("falls back to capability default model pricing", async () => {
    const { calculateMorphCredits } = await import("../../src/lib/morphUsageDb.ts");
    const result = calculateMorphCredits({
      capability: "compact",
      model: null,
      tokens: { input_tokens: 2000, output_tokens: 1000 },
    });

    expect(result.model).toBe(MORPH_CORE_INTERNAL_MODELS.compact);
    expect(result.credits).toBeCloseTo(90, 5);
  });

  it("ignores legacy auto compact records in Morph request totals", async () => {
    const { saveMorphUsage, getMorphUsageStats, resetMorphUsageDbForTests } = await import("../../src/lib/morphUsageDb.ts");
    resetMorphUsageDbForTests();

    await saveMorphUsage({
      capability: "apply",
      entrypoint: "/morphllm/v1/chat/completions",
      model: MORPH_CORE_INTERNAL_MODELS.applyDefault,
      status: "ok",
      tokens: { input_tokens: 100, output_tokens: 50 },
      apiKeyLabel: "owner@example.com",
      timestamp: "2026-05-01T11:00:00.000Z",
    });
    await saveMorphUsage({
      capability: "auto-compact",
      entrypoint: "/internal/auto-compact",
      category: "auto_compact",
      status: "ok",
      tokens: { input_tokens: 0, output_tokens: 0 },
      timestamp: "2026-05-01T11:05:00.000Z",
    });

    const stats = await getMorphUsageStats("24h");
    expect(stats.totalRequests).toBe(1);
    expect(stats.totalRequestsLifetime).toBe(1);
    expect(stats.recentRequests).toHaveLength(1);
    expect(stats).not.toHaveProperty("autoCompact");
  });
});

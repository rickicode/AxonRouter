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

describe("usageDb write serialization", () => {
  let tempDir;

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-db-serialize-"));
    process.env.DATA_DIR = tempDir;
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("serializes overlapping saveRequestUsage calls and preserves both entries", async () => {
    const { getUsageStats, saveRequestUsage } = await import("../../src/lib/usageDb.ts");

    await Promise.all([
      saveRequestUsage({ model: "gpt-4", provider: "openai", timestamp: "2026-04-25T12:00:00.000Z" }),
      saveRequestUsage({ model: "gpt-4.1", provider: "openai", timestamp: "2026-04-25T12:00:01.000Z" }),
    ]);

    const stats = await getUsageStats("all");

    expect(stats.totalRequests).toBe(2);
    expect(Object.keys(stats.byModel).sort()).toEqual([
      "gpt-4.1|openai",
      "gpt-4|openai",
    ]);
  });
});

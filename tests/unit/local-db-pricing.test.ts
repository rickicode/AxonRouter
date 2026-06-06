import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempDirs = [];
let sqliteHelpersModule = null;

vi.mock("@/lib/dataDir", () => ({
  getDataDir: () => process.env.DATA_DIR,
  get DATA_DIR() {
    return process.env.DATA_DIR;
  },
}));

vi.mock("@/lib/connectionStatus", () => ({
  getConnectionEffectiveStatus: vi.fn((connection) => connection?.__status || "unknown"),
  getConnectionStatusDetails: vi.fn((connection) => ({ status: connection?.__status || "unknown" })),
}));

vi.mock("@/lib/providerHotState", () => ({
  clearAllHotState: vi.fn(async () => {}),
  clearProviderHotState: vi.fn(async () => {}),
  deleteConnectionHotState: vi.fn(async () => {}),
  extractHotState: vi.fn(() => null),
  mergeConnectionsWithHotState: vi.fn(async (connections) => connections),
  setConnectionHotState: vi.fn(async () => null),
  isHotOnlyUpdate: vi.fn(() => false),
  projectLegacyConnectionState: vi.fn((value) => value || {}),
}));

vi.mock("@/lib/opencodeSync/schema", () => ({
  createDefaultOpenCodePreferences: vi.fn(() => ({})),
  normalizeOpenCodePreferences: vi.fn((value) => (value && typeof value === "object" ? value : {})),
  validateOpenCodePreferences: vi.fn((value) => (value && typeof value === "object" ? value : {})),
}));

async function createTempDataDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "axonrouter-pricing-"));
  tempDirs.push(dir);
  return dir;
}

async function setupDataDir({ jsonData } = {}) {
  const dataDir = await createTempDataDir();
  process.env.DATA_DIR = dataDir;

  if (jsonData) {
    await fs.writeFile(path.join(dataDir, "db.json"), JSON.stringify(jsonData, null, 2));
  }
}

async function loadLocalDb(options) {
  await setupDataDir(options);
  vi.resetModules();
  const localDb = await import("../../src/lib/localDb.ts");
  sqliteHelpersModule = await import("../../src/lib/sqliteHelpers.ts");
  return { localDb, sqliteHelpers: sqliteHelpersModule };
}

beforeEach(() => {
  sqliteHelpersModule = null;
});

afterEach(async () => {
  sqliteHelpersModule?.closeSqliteDb?.();
  sqliteHelpersModule = null;
  delete process.env.DATA_DIR;
  vi.resetModules();

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("localDb pricing SQLite authority", () => {
  it("serves canonical provider pricing and ignores legacy lowdb overrides", async () => {
    const { localDb } = await loadLocalDb({
      jsonData: { pricing: { gh: { "gpt-5.3-codex": { input: 9 } } } },
    });

    const pricing = await localDb.getPricing();

    expect(pricing.gh["gpt-5.3-codex"]).toMatchObject({
      input: 1.75,
      output: 14,
      cached: 0.175,
    });
  });

  it("rejects pricing override mutations", async () => {
    const { localDb } = await loadLocalDb();

    await expect(localDb.updatePricing({ custom: { model: { input: 1 } } })).rejects.toThrow("Pricing overrides are disabled");
    await expect(localDb.resetPricing("custom", "model")).rejects.toThrow("Pricing overrides are disabled");
    await expect(localDb.resetAllPricing()).rejects.toThrow("Pricing overrides are disabled");
  });

  it("does not import legacy pricing into SQLite", async () => {
    const { localDb, sqliteHelpers } = await loadLocalDb();

    await localDb.importDb({
      format: "axonrouter-db-v1",
      providerConnections: [],
      providerNodes: [],
      proxyPools: [],
      modelAliases: {},
      customModels: [],
      mitmAlias: {},
      combos: [],
      apiKeys: [],
      pricing: { custom: { imported: { input: 7, output: 8 } } },
      settings: { cloudEnabled: false },
    });

    expect(sqliteHelpers.loadSingletonFromSqlite("pricing")).toBeNull();
  });
});

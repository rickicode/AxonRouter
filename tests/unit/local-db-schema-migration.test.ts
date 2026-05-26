import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs = [];

async function createTempDataDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "axonrouter-schema-migration-"));
  tempDirs.push(dir);
  return dir;
}

async function loadModulesWithTempDataDir() {
  const dataDir = await createTempDataDir();
  process.env.DATA_DIR = dataDir;
  delete process.env.REDIS_URL;
  delete process.env.REDIS_HOST;
  vi.resetModules();

  const localDb = await import("../../src/lib/localDb.ts");
  return { dataDir, localDb };
}

afterEach(async () => {
  try {
    const sqliteHelpers = await import("@/lib/sqliteHelpers");
    sqliteHelpers.closeSqliteDb();
  } catch (_) {}

  delete process.env.DATA_DIR;
  delete process.env.REDIS_URL;
  delete process.env.REDIS_HOST;
  vi.resetModules();

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("localDb schema migration", () => {
  it("migrates schema v1 imports to schema v2 and normalizes Codex account metadata", async () => {
    const { localDb } = await loadModulesWithTempDataDir();

    const imported = await localDb.importDb({
      format: "axonrouter-db-v1",
      schemaVersion: 1,
      providerConnections: [
        {
          id: "codex-1",
          provider: "codex",
          authType: "oauth",
          name: "user@example.com",
          email: "user@example.com",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          isActive: true,
          priority: 1,
          providerSpecificData: {
            planTypeRaw: "team",
            chatgptUserId: "user-123",
            chatgptAccountId: "acct-456",
          },
        },
      ],
      providerNodes: [],
      proxyPools: [],
      modelAliases: {},
      customModels: [],
      mitmAlias: {},
      combos: [],
      apiKeys: [],
      pricing: {
        legacy: {
          model: { input: 1, output: 2 },
        },
      },
    });

    expect(imported.modelComboMappings).toEqual([]);
    expect(imported).not.toHaveProperty("pricing");

    const codex = await localDb.getProviderConnectionById("codex-1");
    expect(codex.providerSpecificData).toEqual({
      planType: "Team",
      planTypeRaw: "team",
      chatgptUserId: "user-123",
      chatgptAccountId: "acct-456",
      isWorkspaceAccount: true,
    });

    const exported = await localDb.exportDb();
    expect(exported.schemaVersion).toBe(2);
    expect(exported.modelComboMappings).toEqual([]);
    expect(exported).not.toHaveProperty("pricing");
    expect(exported.providerConnections[0].providerSpecificData).toEqual({
      planType: "Team",
      planTypeRaw: "team",
      chatgptUserId: "user-123",
      chatgptAccountId: "acct-456",
      isWorkspaceAccount: true,
    });
  });
});

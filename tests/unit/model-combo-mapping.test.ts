import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tempDir: string;
let localDb: typeof import("../../src/lib/localDb.ts");

async function resetDataDir() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axonrouter-combo-mapping-"));
  process.env.DATA_DIR = tempDir;
  if (localDb?.prepareLocalDbForExternalRestore) {
    await localDb.prepareLocalDbForExternalRestore();
    vi.resetModules();
    localDb = await import("../../src/lib/localDb.ts");
  }
}

describe("model combo mapping globs", () => {
  beforeAll(async () => {
    await resetDataDir();
    localDb = await import("../../src/lib/localDb.ts");
  });

  beforeEach(async () => {
    await resetDataDir();
    await localDb.createCombo({
      id: "combo-a",
      name: "research",
      models: [{ kind: "model", model: "openai/gpt-4.1" }],
    });
    await localDb.createCombo({
      id: "combo-b",
      name: "fast",
      models: [{ kind: "model", model: "openai/gpt-4o-mini" }],
    });
  });

  afterEach(async () => {
    await localDb.prepareLocalDbForExternalRestore();
    vi.resetModules();
    delete process.env.DATA_DIR;
    vi.resetAllMocks();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("escapes regex metacharacters while preserving glob wildcards", () => {
    const regex = localDb.globToRegex("openai/gpt-4.?*");

    expect(regex.test("openai/gpt-4.1-mini")).toBe(true);
    expect(regex.test("openai/gpt-401-mini")).toBe(false);
  });

  it("trims mapping patterns before matching", () => {
    const regex = localDb.globToRegex("  combo-*  ");

    expect(regex.test("combo-fast")).toBe(true);
    expect(regex.test("xcombo-fast")).toBe(false);
  });

  it("normalizes model strings before resolving mappings", async () => {
    await localDb.createModelComboMapping({ pattern: "openai/gpt-*", comboId: "combo-a", priority: 0 });

    await expect(localDb.resolveComboForModel("  openai/gpt-4.1  ")).resolves.toMatchObject({ id: "combo-a" });
  });

  it("matches combo-prefixed aliases against mapping patterns", async () => {
    await localDb.createModelComboMapping({ pattern: "research", comboId: "combo-a", priority: 0 });

    await expect(localDb.resolveComboForModel("combo/research")).resolves.toMatchObject({ id: "combo-a" });
  });

  it("rejects duplicate mapping pattern and priority pairs", async () => {
    await localDb.createModelComboMapping({ pattern: "openai/gpt-*", comboId: "combo-a", priority: 10 });

    await expect(localDb.createModelComboMapping({ pattern: " OPENAI/GPT-* ", comboId: "combo-b", priority: 10 })).rejects.toThrow(
      /already exists/,
    );
  });
});

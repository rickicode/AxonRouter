import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/dataDir", () => ({
  getDataDir: () => process.env.DATA_DIR,
  get DATA_DIR() {
    return process.env.DATA_DIR;
  },
}));

import {
  MORPH_INSTRUCTIONS_FILENAME,
  deleteCustomMorphInstructionsFile,
  normalizeMorphInstructionsSettings,
  readCustomMorphInstructionsFile,
  resolveMorphInstructionsFromConfig,
  writeCustomMorphInstructionsFile,
} from "../../open-sse/config/morphInstructionsResolver.ts";
import { MORPH_DEFAULT_INSTRUCTIONS } from "../../open-sse/config/morphInstructions.ts";

describe("Morph instructions resolver", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "morph-instr-"));
    process.env.DATA_DIR = dataDir;
    await deleteCustomMorphInstructionsFile();
  });

  afterEach(async () => {
    await deleteCustomMorphInstructionsFile();
    delete process.env.DATA_DIR;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("defaults to enabled default mode", () => {
    expect(normalizeMorphInstructionsSettings(undefined)).toEqual({ enabled: true, mode: "default" });
  });

  it("supports explicit off mode via enabled false", () => {
    expect(resolveMorphInstructionsFromConfig({ enabled: false, mode: "default" }, null)).toBe("");
  });

  it("falls back to Morph defaults when custom mode has no file", () => {
    expect(resolveMorphInstructionsFromConfig({ enabled: true, mode: "custom" }, null)).toBe(MORPH_DEFAULT_INSTRUCTIONS);
  });

  it("reads and writes the custom Morph instructions file", async () => {
    await writeCustomMorphInstructionsFile("custom morph prompt");
    expect(MORPH_INSTRUCTIONS_FILENAME).toBe("morph-instructions.md");
    await expect(readCustomMorphInstructionsFile()).resolves.toBe("custom morph prompt");
  });
});

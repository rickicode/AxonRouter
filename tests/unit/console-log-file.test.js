import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let TEST_DIR;
let TEST_LOG_FILE;

beforeEach(() => {
  TEST_DIR = mkdtempSync(path.join(tmpdir(), "consolelog-test-"));
  TEST_LOG_FILE = path.join(TEST_DIR, "logs", "console.log");
  process.env.CONSOLE_LOG_FILE = TEST_LOG_FILE;
  delete process.env.CONSOLE_LOG_MAX_BYTES;
  delete process.env.CONSOLE_LOG_MAX_FILES;
});

afterEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
  delete process.env.CONSOLE_LOG_FILE;
  delete process.env.CONSOLE_LOG_MAX_BYTES;
  delete process.env.CONSOLE_LOG_MAX_FILES;
  vi.resetModules();
});

describe("consoleLogBuffer file logging & rotation", () => {
  it("writes lines to the log file", async () => {
    const mod = await import("../../src/lib/consoleLogBuffer.js");
    await mod.writeLogLines(["[INFO] test line 1", "[WARN] test line 2"]);

    expect(existsSync(TEST_LOG_FILE)).toBe(true);
    const content = readFileSync(TEST_LOG_FILE, "utf8");
    expect(content).toContain("[INFO] test line 1\n");
    expect(content).toContain("[WARN] test line 2\n");
  }, 10000);

  it("rotates file when size exceeds limit (capped to max 5 files)", async () => {
    process.env.CONSOLE_LOG_MAX_BYTES = "200"; // 200 bytes cap for testing
    process.env.CONSOLE_LOG_MAX_FILES = "5";

    const mod = await import("../../src/lib/consoleLogBuffer.js");

    // Write enough batches to trigger multiple rotations
    for (let i = 0; i < 10; i++) {
      await mod.writeLogLines([`batch-${i}: ` + "x".repeat(150)]);
    }

    const dir = path.dirname(TEST_LOG_FILE);
    const files = readdirSync(dir);

    // Should not exceed 5 files
    expect(files.length).toBeLessThanOrEqual(5);
    expect(files).toContain("console.log");
    expect(files).toContain("console.1.log");

    // File 5 or higher should not exist
    expect(files).not.toContain("console.5.log");
    expect(files).not.toContain("console.6.log");
  }, 10000);

  it("rotateLogFiles shifts files properly", async () => {
    const mod = await import("../../src/lib/consoleLogBuffer.js");

    await mod.writeLogLines(["line A"]);
    mod.rotateLogFiles(TEST_LOG_FILE, 3);
    await mod.writeLogLines(["line B"]);
    mod.rotateLogFiles(TEST_LOG_FILE, 3);
    await mod.writeLogLines(["line C"]);

    const dir = path.dirname(TEST_LOG_FILE);
    const files = readdirSync(dir).sort();

    expect(files).toEqual(["console.1.log", "console.2.log", "console.log"]);
    expect(readFileSync(path.join(dir, "console.log"), "utf8")).toBe("line C\n");
    expect(readFileSync(path.join(dir, "console.1.log"), "utf8")).toBe("line B\n");
    expect(readFileSync(path.join(dir, "console.2.log"), "utf8")).toBe("line A\n");

    // Rotate again -> oldest (line A) should be dropped
    mod.rotateLogFiles(TEST_LOG_FILE, 3);
    await mod.writeLogLines(["line D"]);

    const filesAfter = readdirSync(dir).sort();
    expect(filesAfter).toEqual(["console.1.log", "console.2.log", "console.log"]);
    expect(readFileSync(path.join(dir, "console.log"), "utf8")).toBe("line D\n");
    expect(readFileSync(path.join(dir, "console.1.log"), "utf8")).toBe("line C\n");
    expect(readFileSync(path.join(dir, "console.2.log"), "utf8")).toBe("line B\n");
  }, 10000);

  it("strips ANSI color codes and captures console.log directly", async () => {
    const mod = await import("../../src/lib/consoleLogBuffer.js");
    mod.initConsoleLogCapture();

    console.log("\x1b[32m[TEST]\x1b[0m Hello World");
    await mod.flushPendingLines();

    expect(existsSync(TEST_LOG_FILE)).toBe(true);
    const content = readFileSync(TEST_LOG_FILE, "utf8");
    expect(content).toContain("[TEST] Hello World\n");
    expect(content).not.toContain("\x1b[32m");
  }, 10000);

  it("loads recent lines on startup when in-memory buffer is empty", async () => {
    const dir = path.dirname(TEST_LOG_FILE);
    mkdirSync(dir, { recursive: true });
    writeFileSync(TEST_LOG_FILE, "startup line 1\nstartup line 2\nstartup line 3\n", "utf8");

    // Clear global buffer state before importing
    delete global._consoleLogBufferState;

    const mod = await import("../../src/lib/consoleLogBuffer.js");
    mod.initConsoleLogCapture();

    const logs = mod.getConsoleLogs();
    expect(logs).toContain("startup line 1");
    expect(logs).toContain("startup line 2");
    expect(logs).toContain("startup line 3");
  }, 10000);
});

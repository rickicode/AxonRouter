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

describe("CONSOLE_LOG_DIR relocation", () => {
  beforeEach(() => {
    // The gateway tags each worker with a directory only — CONSOLE_LOG_FILE is
    // not set. The combined stream must follow the channels into that directory
    // rather than falling back to the default data dir.
    delete process.env.CONSOLE_LOG_FILE;
    process.env.CONSOLE_LOG_DIR = path.join(TEST_DIR, "gateway", "w2");
  });

  afterEach(() => {
    delete process.env.CONSOLE_LOG_DIR;
  });

  it("resolves the combined log inside CONSOLE_LOG_DIR", async () => {
    const mod = await import("../../src/lib/consoleLogBuffer.js");
    expect(mod.getLogFilePath()).toBe(
      path.join(TEST_DIR, "gateway", "w2", "console.log")
    );
  }, 10000);

  it("keeps channel files alongside the combined log", async () => {
    const mod = await import("../../src/lib/consoleLogBuffer.js");
    const dir = process.env.CONSOLE_LOG_DIR;

    expect(mod.getChannelLogFilePath(mod.LOG_CHANNEL_REQUEST)).toBe(
      path.join(dir, "request.log")
    );
    expect(mod.getChannelLogFilePath(mod.LOG_CHANNEL_BACKGROUND)).toBe(
      path.join(dir, "background.log")
    );
    expect(path.dirname(mod.getLogFilePath())).toBe(dir);
  }, 10000);

  it("lets an explicit CONSOLE_LOG_FILE win over the directory", async () => {
    const explicit = path.join(TEST_DIR, "explicit.log");
    process.env.CONSOLE_LOG_FILE = explicit;
    const mod = await import("../../src/lib/consoleLogBuffer.js");
    expect(mod.getLogFilePath()).toBe(explicit);
  }, 10000);
});

describe("gateway worker logs surfaced in the console", () => {
  const workers = ["w1", "w2"];

  beforeEach(() => {
    delete process.env.CONSOLE_LOG_FILE;
    delete process.env.CONSOLE_LOG_DIR;
    // Both containers mount the same log dir, so the dashboard process can read
    // the gateway's per-worker files the same way it writes its own.
    const root = path.join(TEST_DIR, "logs");
    for (const w of workers) {
      const dir = path.join(root, "gateway", w);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, "console.log"),
        `[10:00:01] worker ${w} first\n[10:00:02] worker ${w} second\n`,
        "utf8"
      );
    }
    process.env.CONSOLE_LOG_FILE = path.join(root, "console.log");
  });

  it("reads every worker's tail", async () => {
    const mod = await import("../../src/lib/consoleLogBuffer.js");
    const lines = mod.getGatewayConsoleLogs();
    expect(lines).toHaveLength(workers.length * 2);
    for (const w of workers) {
      expect(lines.some((l) => l.includes(`worker ${w} second`))).toBe(true);
    }
  }, 10000);

  it("fails open when the gateway directory is absent", async () => {
    process.env.CONSOLE_LOG_FILE = path.join(TEST_DIR, "nope", "console.log");
    const mod = await import("../../src/lib/consoleLogBuffer.js");
    expect(mod.getGatewayConsoleLogs()).toEqual([]);
  }, 10000);

  it("merges gateway lines into a single timeline", async () => {
    const mod = await import("../../src/lib/consoleLogBuffer.js");
    const merged = mod.getAllConsoleLogs();
    expect(merged.some((l) => l.includes("worker w1 first"))).toBe(true);
    expect(merged.some((l) => l.includes("worker w2 second"))).toBe(true);
    // Ordered by the [HH:MM:SS] stamp the writer prefixes each line with.
    const stamps = merged.map((l) => (l.match(/^\[(\d{2}:\d{2}:\d{2})\]/) || [])[1]).filter(Boolean);
    expect([...stamps].sort()).toEqual(stamps);
  }, 10000);

  it("does not split-file blind the console: worker lines are present in the merge", async () => {
    const mod = await import("../../src/lib/consoleLogBuffer.js");
    expect(mod.getAllConsoleLogs().length).toBeGreaterThanOrEqual(mod.getConsoleLogs().length);
  }, 10000);
});

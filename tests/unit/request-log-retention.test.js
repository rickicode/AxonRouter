import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let ROOT;

beforeEach(() => {
  ROOT = mkdtempSync(path.join(tmpdir(), "reqlog-"));
  process.env.ENABLE_REQUEST_LOGS = "true";
  process.env.REQUEST_LOG_MAX_GB = "0.0001"; // ~105KB cap -> deterministic
  process.env.REQUEST_LOG_RETENTION_INTERVAL_MS = "0"; // force every call
  process.chdir(ROOT);
});
afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  vi.resetModules();
});

async function makeSession(mod, i) {
  const logger = await mod.createRequestLogger("openai", "openai", `m${i}`);
  if (logger.sessionPath) {
    writeFileSync(path.join(logger.sessionPath, "x.json"), "x".repeat(1000));
  }
  return logger;
}

describe("requestLogger retention", () => {
  it("creates a session dir under ./logs when enabled", async () => {
    vi.resetModules();
    const mod = await import("../../open-sse/utils/requestLogger.js");
    const logger = await makeSession(mod, 0);
    expect(logger.sessionPath).not.toBeNull();
    expect(logger.sessionPath).toContain(path.join("logs"));
  });

  it("keeps total log size under REQUEST_LOG_MAX_GB (oldest-first eviction)", async () => {
    vi.resetModules();
    const mod = await import("../../open-sse/utils/requestLogger.js");
    for (let i = 0; i < 200; i++) await makeSession(mod, i);

    const logsDir = path.join(ROOT, "logs");
    let total = 0;
    let count = 0;
    for (const name of readdirSync(logsDir)) {
      const d = path.join(logsDir, name);
      const st = statSync(d);
      if (st.isDirectory()) {
        total += statSync(path.join(d, "x.json")).size;
        count++;
      }
    }
    const capBytes = 0.0001 * 1024 * 1024 * 1024;
    // Retention runs before the per-session file write, so the most recent
    // batch can overshoot by one file size (1KB) — accept that gap.
    expect(total).toBeLessThanOrEqual(capBytes + 1000);
    // Evicted many of the 200 sessions (oldest first)
    expect(count).toBeLessThan(200);
  });

  it("no-op logger when ENABLE_REQUEST_LOGS is false", async () => {
    process.env.ENABLE_REQUEST_LOGS = "false";
    vi.resetModules();
    const mod = await import("../../open-sse/utils/requestLogger.js");
    const logger = await mod.createRequestLogger("openai", "openai", "m");
    expect(logger.sessionPath).toBeNull();
  });
});

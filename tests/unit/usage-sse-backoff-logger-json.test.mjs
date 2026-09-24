import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function readSrc(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

const STATS = "src/shared/components/UsageStats.js";
const LOGGER = "src/shared/components/RequestLogger.js";
const PAGE = "src/app/(dashboard)/dashboard/usage/page.js";
const STREAM = "src/app/api/usage/stream/route.js";
const REPO = "src/lib/db/repos/usageRepo.js";

describe("[axonrouter-X usage] SSE backoff + logger JSON + mobile wrap", () => {
  describe("1. UsageStats SSE: exponential backoff + visibility pause", () => {
    it("SSE useEffect has connect() function with exponential backoff", () => {
      const src = readSrc(STATS);
      // Must have a connect() function pattern
      assert.ok(src.includes("function connect()"), "SSE must define connect() function");
      assert.ok(src.includes("new EventSource(\"/api/usage/stream\")"), "connect must create EventSource to /api/usage/stream");
    });

    it("backoff delay uses exponential formula with 30s cap", () => {
      const src = readSrc(STATS);
      assert.ok(src.includes("MAX_BACKOFF_MS"), "Must define MAX_BACKOFF_MS constant");
      assert.ok(src.includes("30000") || src.includes("30_000"), "MAX_BACKOFF_MS must be 30000");
      // Exponential: 1000 * 2^attempt
      assert.ok(
        /1000\s*\*\s*2\s*\*\*\s*attempt/.test(src),
        "Backoff delay must use exponential 1000 * 2 ** attempt",
      );
    });

    it("document.hidden check pauses SSE reconnect in onerror", () => {
      const src = readSrc(STATS);
      // Inside onerror handler, must check document.hidden before reconnecting
      assert.ok(
        src.includes("if (document.hidden) return") || src.includes("if (document.hidden) return;"),
        "onerror must pause when document.hidden",
      );
    });

    it("visibilitychange listener reconnects when tab becomes visible", () => {
      const src = readSrc(STATS);
      assert.ok(
        src.includes("visibilitychange"),
        "Must listen to visibilitychange events",
      );
      // Must check readyState === EventSource.CLOSED to avoid double-connect
      assert.ok(
        src.includes("EventSource.CLOSED"),
        "Must check EventSource.CLOSED before reconnect on visibility",
      );
    });

    it("cleanup clears retryTimer and removes visibilitychange listener", () => {
      const src = readSrc(STATS);
      assert.ok(src.includes("clearTimeout(retryTimer)"), "Cleanup must clear retryTimer");
      assert.ok(
        src.includes("removeEventListener") && src.includes("visibilitychange"),
        "Cleanup must remove visibilitychange listener",
      );
    });

    it("onopen resets attempt counter to 0", () => {
      const src = readSrc(STATS);
      assert.ok(src.includes("es.onopen"), "Must handle onopen event");
      assert.ok(
        /onopen.*\{[\s\S]*attempt\s*=\s*0/.test(src),
        "onopen must reset attempt to 0",
      );
    });
  });

  describe("2. SSE stream server sends retry directive", () => {
    it("stream route sends retry: 3000 before first data", () => {
      const src = readSrc(STREAM);
      assert.ok(
        src.includes("retry: 3000") || src.includes("retry:\\s*3000"),
        "SSE stream must send retry: 3000 directive",
      );
    });
  });

  describe("3. RequestLogger: structured JSON + legacy pipe-delimited fallback", () => {
    it("parseLogEntry handles structured object format", () => {
      const src = readSrc(LOGGER);
      // Must have parseLogEntry function
      assert.ok(src.includes("function parseLogEntry"), "Must define parseLogEntry function");
      // Object passthrough: typeof entry === 'object' check
      assert.ok(
        src.includes("typeof entry === \"object\"") || src.includes("typeof entry === 'object'"),
        "parseLogEntry must handle object input",
      );
    });

    it("parseLogEntry handles legacy pipe-delimited string fallback", () => {
      const src = readSrc(LOGGER);
      assert.ok(
        src.includes('split(" | ")') || src.includes("split(' | ')"),
        "parseLogEntry must handle pipe-delimited string fallback",
      );
      assert.ok(
        src.includes("parts.length >= 7"),
        "parseLogEntry must validate at least 7 pipe-separated parts",
      );
    });

    it("normalize logs via parseLogEntry in fetchLogs response handler", () => {
      const src = readSrc(LOGGER);
      // fetchLogs must call parseLogEntry on each item
      assert.ok(
        src.includes(".map(parseLogEntry)"),
        "fetchLogs must map through parseLogEntry",
      );
      assert.ok(
        src.includes(".filter(Boolean)"),
        "Must filter out null entries from parseLogEntry",
      );
    });

    it("handleOpenDetail receives structured object, not raw string", () => {
      const src = readSrc(LOGGER);
      // handleOpenDetail should work with structured objects
      assert.ok(
        src.includes("handleOpenDetail(log)") || src.includes("handleOpenDetail(entry)"),
        "handleOpenDetail must receive structured log object",
      );
      // Should NOT split pipe-delimited string in handleOpenDetail anymore
      assert.ok(
        !src.includes("rawLog.split"),
        "handleOpenDetail must not use rawLog.split pipe parsing",
      );
    });

    it("table rendering uses structured log fields directly", () => {
      const src = readSrc(LOGGER);
      // Table rows must access log.model, log.status etc. directly
      assert.ok(src.includes("log.datetime"), "Table must use log.datetime");
      assert.ok(src.includes("log.model"), "Table must use log.model");
      assert.ok(src.includes("log.provider"), "Table must use log.provider");
      assert.ok(src.includes("log.status"), "Table must use log.status");
    });
  });

  describe("4. usageRepo.getRecentLogs returns JSON objects", () => {
    it("getRecentLogs returns objects with datetime, model, provider, status fields", () => {
      const src = readSrc(REPO);
      assert.ok(
        src.includes("datetime: ts"),
        "getRecentLogs must return object with datetime field",
      );
      assert.ok(
        src.includes("model: m"),
        "getRecentLogs must return object with model field",
      );
      assert.ok(
        src.includes("provider: p"),
        "getRecentLogs must return object with provider field",
      );
      assert.ok(
        src.includes("status: row.status"),
        "getRecentLogs must return object with status field",
      );
    });

    it("getRecentLogs includes raw field for backward compatibility", () => {
      const src = readSrc(REPO);
      assert.ok(
        src.includes("raw"),
        "getRecentLogs must include raw field for backward compat",
      );
    });
  });

  describe("5. Period selector: flex-wrap for mobile responsiveness", () => {
    it("UsageStats period selector uses flex flex-wrap instead of grid grid-cols-5", () => {
      const src = readSrc(STATS);
      // Must not use grid-cols-5 for the period grid
      assert.ok(
        !src.includes("grid-cols-5"),
        "Period selector must not use grid-cols-5 (breaks on mobile with 5 items)",
      );
      // Must use flex-wrap
      assert.ok(
        src.includes("flex-wrap") || src.includes("flex flex-1 flex-wrap"),
        "Period selector must use flex-wrap for mobile",
      );
    });
  });
});

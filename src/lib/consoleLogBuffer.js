import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "events";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config.js";
import { getDataDir } from "./dataDir.js";

const consoleLevels = ["log", "info", "warn", "error", "debug"];

if (!global._consoleLogBufferState) {
  global._consoleLogBufferState = {
    logs: [],
    patched: false,
    originals: {},
    emitter: new EventEmitter(),
  };
  global._consoleLogBufferState.emitter.setMaxListeners(50);
}

const state = global._consoleLogBufferState;

if (!state.emitter) {
  state.emitter = new EventEmitter();
  state.emitter.setMaxListeners(50);
}

if (!state.pendingLines) state.pendingLines = [];
if (!state.flushTimer) state.flushTimer = null;

const FLUSH_INTERVAL_MS = 100;
const MAX_BATCH_LINES = 50;
let isWriting = false;
// dirEnsured caches the mkdirSync + statSync cost: both are constant for the
// process lifetime (same log dir), so re-checking per 100ms flush wasted
// syscalls on the request path.
let dirEnsured = null;

function ensureLogDir(logFile) {
  if (dirEnsured === logFile) return;
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  dirEnsured = logFile;
}

export function getLogFilePath() {
  if (process.env.CONSOLE_LOG_FILE) return process.env.CONSOLE_LOG_FILE;
  try {
    const dataDir = getDataDir();
    return path.join(dataDir, "logs", "console.log");
  } catch {
    return path.join(process.cwd(), "logs", "console.log");
  }
}

export function getRotatedPath(baseFile, index) {
  const dir = path.dirname(baseFile);
  const ext = path.extname(baseFile);
  const base = path.basename(baseFile, ext);
  return path.join(dir, `${base}.${index}${ext}`);
}

export function rotateLogFiles(baseFile, maxFiles = 5) {
  try {
    if (maxFiles <= 1) {
      if (fs.existsSync(baseFile)) fs.rmSync(baseFile, { force: true });
      return;
    }

    const oldest = getRotatedPath(baseFile, maxFiles - 1);
    if (fs.existsSync(oldest)) {
      fs.rmSync(oldest, { force: true });
    }

    for (let i = maxFiles - 2; i >= 1; i--) {
      const src = getRotatedPath(baseFile, i);
      const dst = getRotatedPath(baseFile, i + 1);
      if (fs.existsSync(src)) {
        if (fs.existsSync(dst)) {
          fs.rmSync(dst, { force: true });
        }
        fs.renameSync(src, dst);
      }
    }

    if (fs.existsSync(baseFile)) {
      const dst1 = getRotatedPath(baseFile, 1);
      if (fs.existsSync(dst1)) {
        fs.rmSync(dst1, { force: true });
      }
      fs.renameSync(baseFile, dst1);
    }
  } catch {
    // Fail-safe
  }
}

export function writeLogLines(lines) {
  if (!lines || !lines.length || isWriting) return Promise.resolve();
  isWriting = true;
  try {
    const logFile = getLogFilePath();
    ensureLogDir(logFile);

    let payload = lines.join("\n") + "\n";
    let payloadBytes = Buffer.byteLength(payload, "utf8");

    const maxFileSize = Number(process.env.CONSOLE_LOG_MAX_BYTES) || CONSOLE_LOG_CONFIG.maxFileSizeBytes || 5 * 1024 * 1024;
    const maxFiles = Number(process.env.CONSOLE_LOG_MAX_FILES) || CONSOLE_LOG_CONFIG.maxFiles || 5;

    if (payloadBytes > maxFileSize) {
      payload = Buffer.from(payload, "utf8").subarray(payloadBytes - maxFileSize).toString("utf8");
      payloadBytes = Buffer.byteLength(payload, "utf8");
    }

    let currentSize = 0;
    try {
      currentSize = fs.statSync(logFile).size;
    } catch {
      currentSize = 0;
    }

    if (currentSize + payloadBytes > maxFileSize) {
      rotateLogFiles(logFile, maxFiles);
    }

    // Async append (event loop stays free), but writeLogLines returns a
    // promise that resolves once the file write lands so callers/tests can
    // await durability; console.log hook just fires it off.
    return fs.promises.appendFile(logFile, payload, "utf8").catch(() => {});
  } catch {
    // Fail-safe
    return Promise.resolve();
  } finally {
    isWriting = false;
  }
}

function loadInitialLogsFromFile() {
  if (state.logs.length > 0) return;
  try {
    const logFile = getLogFilePath();
    if (!fs.existsSync(logFile)) return;
    const stat = fs.statSync(logFile);
    if (stat.size === 0) return;

    const readSize = Math.min(stat.size, 128 * 1024);
    const buffer = Buffer.alloc(readSize);
    const fd = fs.openSync(logFile, "r");
    try {
      fs.readSync(fd, buffer, 0, readSize, stat.size - readSize);
    } finally {
      fs.closeSync(fd);
    }

    const text = buffer.toString("utf8");
    let lines = text.split("\n").filter(Boolean);
    if (stat.size > readSize && lines.length > 1) {
      lines = lines.slice(1);
    }
    const maxLines = CONSOLE_LOG_CONFIG.maxLines || 200;
    state.logs = lines.slice(-maxLines);
  } catch {
    // Ignore
  }
}

export function flushPendingLines() {
  state.flushTimer = null;
  if (!state.pendingLines.length) return Promise.resolve();

  const lines = state.pendingLines.splice(0, state.pendingLines.length);
  state.emitter.emit("lines", lines);
  return Promise.resolve(writeLogLines(lines));
}

function scheduleFlush() {
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(flushPendingLines, FLUSH_INTERVAL_MS);
  state.flushTimer?.unref?.();
}

function toLogLine(level, args) {
  return args.map(formatArg).join(" ");
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(str) {
  return str.replace(ANSI_RE, "");
}

function formatArg(arg) {
  if (typeof arg === "string") return stripAnsi(arg);
  if (arg instanceof Error) return stripAnsi(arg.stack || arg.message || String(arg));
  try {
    return stripAnsi(JSON.stringify(arg));
  } catch {
    return stripAnsi(String(arg));
  }
}

function appendLine(line) {
  state.logs.push(line);
  const maxLines = CONSOLE_LOG_CONFIG.maxLines;
  if (state.logs.length > maxLines) {
    state.logs = state.logs.slice(-maxLines);
  }
  state.pendingLines.push(line);
  if (state.pendingLines.length >= MAX_BATCH_LINES) {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    flushPendingLines();
  } else {
    scheduleFlush();
  }
}

export function initConsoleLogCapture() {
  loadInitialLogsFromFile();

  if (state.patched) return;

  for (const level of consoleLevels) {
    state.originals[level] = console[level];
    console[level] = (...args) => {
      appendLine(toLogLine(level, args));
      state.originals[level](...args);
    };
  }

  state.patched = true;
}

export function getConsoleLogs() {
  return state.logs;
}

export function clearConsoleLogs() {
  state.logs = [];
  state.emitter.emit("clear");
}

export function getConsoleEmitter() {
  return state.emitter;
}

if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("beforeExit", () => {
    Promise.resolve(flushPendingLines()).catch(() => {});
  });
}

import fs from "node:fs";
import { EventEmitter } from "events";
import {
  getChatObservabilityMode,
  getChatObservabilitySampleRate,
  getUpstreamTimeoutMs,
  getStreamIdleTimeoutMs,
} from "../../open-sse/utils/abort";
import { resolveDataPath } from "./dataDir";
import { ensureUsageSchema } from "./usageDb/bootstrap";
import { getUsageDbInstance } from "./usageDb/core";
import { getPluginUsageSummary } from "./usageDb/queries/analytics";
import { getRecentUsageRowsFromDb, getUsageStatsFromDb } from "./usageDb/queries/index";
import { drainUsageQueue } from "./usageDb/backgroundQueue";
import { queueRequestLogEvent, queueUsageEvent } from "./usageDb/queueFacade";

const ENABLE_USAGE_SQLITE_WRITE = true;

const isCloud = typeof caches !== 'undefined' && typeof caches === 'object';


function shouldSampleObservability() {
  return Math.random() < getChatObservabilitySampleRate();
}


function shouldPersistUsageEntry() {
  return getChatObservabilityMode() !== "off";
}

function shouldPersistRequestLog(status) {
  const mode = getChatObservabilityMode();
  if (mode === "off") return false;
  if (mode === "minimal") return typeof status === "string" && status.startsWith("FAILED");
  if (mode === "sampled") {
    return (typeof status === "string" && status.startsWith("FAILED")) || shouldSampleObservability();
  }
  return true;
}


// Use global to share pending state across Next.js route modules
if (!global._pendingRequests) {
  global._pendingRequests = { byModel: {}, byAccount: {} };
}
const pendingRequests = global._pendingRequests;

// Track last error provider for UI edge coloring (auto-clears after 10s)
if (!global._lastErrorProvider) {
  global._lastErrorProvider = { provider: "", ts: 0 };
}
const lastErrorProvider = global._lastErrorProvider;

// Use global to share singleton across Next.js route modules
if (!global._statsEmitter) {
  global._statsEmitter = new EventEmitter();
  global._statsEmitter.setMaxListeners(50);
}
export const statsEmitter = global._statsEmitter;

// Safety timers — force-clear pending counts after 1 min if END was never
// called. Each (connectionId, model) key maps to an ARRAY of timer ids so
// concurrent in-flight requests for the same (connection, model) tuple don't
// silently overwrite each other's safety timer (which previously meant only
// the LAST start's timer survived; if N starts overlapped and only one end
// fired, the other N-1 leaked their timers and counters until process exit).
if (!global._pendingTimers) global._pendingTimers = {};
const pendingTimers = {};
const getPendingTimeoutMs = () => {
  const upstreamTimeoutMs = getUpstreamTimeoutMs();
  const streamIdleTimeoutMs = getStreamIdleTimeoutMs();
  const candidates = [upstreamTimeoutMs, streamIdleTimeoutMs].filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  const baseTimeoutMs = candidates.length > 0 ? Math.max(...candidates) : 60 * 1000;
  return Math.max(baseTimeoutMs + 5_000, 60 * 1000);
};
const ANSI_PINK = "\x1b[38;5;205m";
const ANSI_RESET = "\x1b[0m";

/**
 * Track a pending request
 * @param {string} model
 * @param {string} provider
 * @param {string} connectionId
 * @param {boolean} started - true if started, false if finished
 * @param {boolean} [error] - true if ended with error
 */
export function trackPendingRequest(model, provider, connectionId, started, error = false, metadata = null) {
  const modelKey = provider ? `${model} (${provider})` : model;
  const timerKey = `${connectionId}|${modelKey}`;

  // Track by model
  if (!pendingRequests.byModel[modelKey]) pendingRequests.byModel[modelKey] = 0;
  pendingRequests.byModel[modelKey] = Math.max(0, pendingRequests.byModel[modelKey] + (started ? 1 : -1));

  // Track by account
  if (connectionId) {
    if (!pendingRequests.byAccount[connectionId]) pendingRequests.byAccount[connectionId] = {};
    if (!pendingRequests.byAccount[connectionId][modelKey]) pendingRequests.byAccount[connectionId][modelKey] = 0;
    pendingRequests.byAccount[connectionId][modelKey] = Math.max(0, pendingRequests.byAccount[connectionId][modelKey] + (started ? 1 : -1));
  }

  if (started) {
    // Safety timeout: force-decrement (NOT zero out) if END is never called.
    // Decrement-by-one ensures other concurrent in-flight starts on the same
    // key are still represented in the counter even after one of them times
    // out.
    const timer = setTimeout(() => {
      const list = pendingTimers[timerKey];
      if (Array.isArray(list)) {
        const idx = list.indexOf(timer);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) delete pendingTimers[timerKey];
      }
      if (pendingRequests.byModel[modelKey] > 0) {
        pendingRequests.byModel[modelKey] -= 1;
      }
      if (connectionId && pendingRequests.byAccount[connectionId]?.[modelKey] > 0) {
        pendingRequests.byAccount[connectionId][modelKey] -= 1;
      }
      statsEmitter.emit("pending");
    }, getPendingTimeoutMs());
    if (!pendingTimers[timerKey]) pendingTimers[timerKey] = [];
    pendingTimers[timerKey].push(timer);
  } else {
    // END called normally — cancel one (the oldest) outstanding safety timer
    // for this key. We can't be sure WHICH start this end corresponds to, so
    // FIFO is the most reasonable approximation.
    const list = pendingTimers[timerKey];
    if (Array.isArray(list) && list.length > 0) {
      const oldest = list.shift();
      clearTimeout(oldest);
      if (list.length === 0) delete pendingTimers[timerKey];
    }
  }

  // Track error provider (auto-clears after 10s)
  if (!started && error && provider) {
    lastErrorProvider.provider = provider.toLowerCase();
    lastErrorProvider.ts = Date.now();
  }

  const t = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const statusLabel = started ? "PENDING" : error ? "ERROR" : "OK";
  const metadataLabel = metadata && typeof metadata === "object"
    ? Object.entries(metadata)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => `${key}=${value}`)
        .join(" | ")
    : "";
  const line = `[${t}] [${statusLabel}] ${started ? "START" : "END"}${error ? " (ERROR)" : ""} | provider=${provider} | model=${model}${metadataLabel ? ` | ${metadataLabel}` : ""}`;
  console.log(provider === "morph" ? `${ANSI_PINK}${line}${ANSI_RESET}` : line);
  statsEmitter.emit("pending");
}

/**
 * Lightweight: get only activeRequests + recentRequests without full stats recalc
 */
export function getUsageDb() {
  const db = getUsageDbInstance();
  ensureUsageSchema(db);
  return db;
}

export { getPluginUsageSummary };

export async function getActiveRequests() {
  const activeRequests = [];

  // Build active requests from pending state
  let connectionMap = {};
  try {
    const { getProviderConnections } = await import("./localDb");
    const allConnections = await getProviderConnections();
    for (const conn of allConnections) {
      connectionMap[conn.id] = conn.name || conn.email || conn.id;
    }
  } catch {}

  for (const [connectionId, models] of Object.entries(pendingRequests.byAccount)) {
    for (const [modelKey, count] of Object.entries(models)) {
      if (count > 0) {
        const accountName = connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
        const match = modelKey.match(/^(.*) \((.*)\)$/);
        const modelName = match ? match[1] : modelKey;
        const providerName = match ? match[2] : "unknown";
        activeRequests.push({ model: modelName, provider: providerName, account: accountName, count });
      }
    }
  }

  ensureUsageSchema(getUsageDbInstance());
  const recentRequests = getRecentUsageRowsFromDb(20, { source: "general" });

  // Error provider (auto-clear after 10s)
  const errorProvider = (Date.now() - lastErrorProvider.ts < 10000) ? lastErrorProvider.provider : "";

  return { activeRequests, recentRequests, errorProvider, pending: pendingRequests };
}

export async function saveRequestUsage(entry, options: any = {}) {
  if (isCloud) return;
  if (!shouldPersistUsageEntry()) return;

  try {
    const persistedEntry = entry?.timestamp ? entry : { ...entry, timestamp: new Date().toISOString() };
    if (ENABLE_USAGE_SQLITE_WRITE) {
      ensureUsageSchema(getUsageDbInstance());
      queueUsageEvent(persistedEntry, { source: "general" });
    }
    statsEmitter.emit("update");
  } catch (error) {
    console.error("Failed to save usage stats:", error);
    if (options.propagateError) {
      throw error;
    }
  }
}

export async function getUsageHistory(filter = {}) {
  const { getUsageHistory: getCanonicalUsageHistory } = await import("./usage/usageHistory");
  return getCanonicalUsageHistory(filter);
}

export async function appendRequestLog({ model, provider, connectionId, tokens, status }) {
  if (isCloud) return;
  if (!shouldPersistRequestLog(status)) return;

  try {
    if (ENABLE_USAGE_SQLITE_WRITE) {
      queueRequestLogEvent({
        timestamp: new Date().toISOString(),
        provider,
        model,
        connectionId,
        tokens,
        status,
      }, { source: "general" });
    }
  } catch (error) {
    console.error("Failed to append usage request log:", error.message);
  }
}

function getLegacyUsageStatsFallback(period) {
  const usageFile = resolveDataPath("usage.json");
  if (!fs.existsSync(usageFile)) return null;
  const parsed = JSON.parse(fs.readFileSync(usageFile, "utf8"));
  const dailySummary = parsed?.dailySummary || {};
  const nowKey = new Date(Date.now()).toISOString().slice(0, 10);
  const keys = Object.keys(dailySummary).filter((key) => key <= nowKey);
  const selected = period === "7d" ? keys.slice(-7) : keys;
  const totals = { totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCost: 0, byProvider: {}, byModel: {} };
  for (const key of selected) {
    const day = dailySummary[key] || {};
    totals.totalRequests += Number(day.requests || 0);
    totals.totalPromptTokens += Number(day.promptTokens || 0);
    totals.totalCompletionTokens += Number(day.completionTokens || 0);
    totals.totalCost += Number(day.cost || 0);
    Object.assign(totals.byProvider, day.byProvider || {});
    for (const [modelKey, value] of Object.entries(day.byModel || {}) as Array<[string, any]>) {
      const rawModel = value?.rawModel || modelKey.split("|")[0];
      const provider = value?.provider || modelKey.split("|")[1] || "unknown";
      const label = `${rawModel} (${provider})`;
      totals.byModel[label] = value;
    }
  }
  return totals;
}

function mergeMorphFastStats(stats: any, morphStats: any) {
  const byModel: Record<string, any> = morphStats?.byModel || {};
  for (const [modelKey, value] of Object.entries(byModel) as Array<[string, any]>) {
    const requests = Number(value?.requests || 0);
    if (requests <= 0) continue;
    const promptTokens = Number(value?.inputTokens || 0);
    const completionTokens = Number(value?.outputTokens || 0);
    stats.byProvider["morph-fast"] = stats.byProvider["morph-fast"] || { requests: 0, promptTokens: 0, completionTokens: 0, cost: 0, provider: "morph-fast" };
    stats.byProvider["morph-fast"].requests += requests;
    stats.byProvider["morph-fast"].promptTokens += promptTokens;
    stats.byProvider["morph-fast"].completionTokens += completionTokens;
    stats.byModel[`${modelKey} (morph-fast)`] = { rawModel: modelKey, provider: "Morph Fast Models", requests, promptTokens, completionTokens };
    stats.totalRequests += requests;
    stats.totalPromptTokens += promptTokens;
    stats.totalCompletionTokens += completionTokens;
    stats.totalTokens += promptTokens + completionTokens;
  }
  stats.recentRequests = [...(morphStats?.recentRequests || []), ...(stats.recentRequests || [])];
  return stats;
}

export async function getUsageStats(period = "all") {
  await drainUsageQueue();
  const liveActivity = await getActiveRequests();
  ensureUsageSchema(getUsageDbInstance());
  const stats = getUsageStatsFromDb(period, liveActivity);
  const baseStats = stats.totalRequests === 0 ? { ...stats, ...getLegacyUsageStatsFallback(period) } : stats;
  const { getMorphUsageStats } = await import("./morphUsageDb");
  return mergeMorphFastStats(baseStats, await getMorphUsageStats(period));
}

export async function getChartData(period = "7d") {
  await drainUsageQueue();
  const { getChartDataFromDb } = await import("./usageDb/queries");
  return getChartDataFromDb(period);
}

// Re-export request details functions from the JSON-backed request details module
export { saveRequestDetail, getRequestDetails, getRequestDetailById, getKnownProviders } from "./requestDetailsDb";

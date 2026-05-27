import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "node:path";
import fs from "node:fs";
import { getDataDir } from "./dataDir";
import { getChatObservabilityMode, getChatObservabilitySampleRate } from "../../open-sse/utils/abort";
import { bootstrapRequestDetailsDb } from "./requestDetailsDb/bootstrap";
import {
  clearActiveRequestDetailFlush,
  configureRequestDetailQueue,
  drainRequestDetailQueue,
  enqueueRequestDetailWrite,
  getActiveRequestDetailFlush,
  peekRequestDetailQueueItems,
  setActiveRequestDetailFlush,
  takeRequestDetailBatch,
} from "./requestDetailsDb/backgroundQueue";
import {
  getKnownProvidersFromDb,
  getRequestDetailByIdFromDb,
  getRequestDetailsIndex,
} from "./requestDetailsDb/queries";
import { flushRequestDetailBatch } from "./requestDetailsDb/writer";

const isCloud = typeof caches !== "undefined" && typeof caches === "object";

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const CONFIG_CACHE_TTL_MS = 5000;
const SHUTDOWN_FLUSH_TIMEOUT_MS = 2000;

if (!isCloud && !fs.existsSync(getDataDir())) {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

let cachedConfig = null;
let cachedConfigTs = 0;

type SaveRequestDetailOptions = {
  forceFlush?: boolean;
  propagateError?: boolean;
};

type RequestDetailsFilter = {
  provider?: string;
  model?: string;
  connectionId?: string;
  status?: string;
  correlationId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

function shouldSampleRequestDetail() {
  return Math.random() < getChatObservabilitySampleRate();
}

function shouldPersistRequestDetail(detail) {
  const mode = getChatObservabilityMode();
  if (mode === "off") return false;
  if (mode === "minimal") return detail?.status === "error";
  if (mode === "sampled") return detail?.status === "error" || shouldSampleRequestDetail();
  return true;
}

async function getObservabilityConfig() {
  if (cachedConfig && (Date.now() - cachedConfigTs) < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const { getSettings } = await import("./localDb");
    const settings = await getSettings();
    const envEnabled = process.env.OBSERVABILITY_ENABLED !== "false";
    const enabled = typeof settings.enableObservability === "boolean"
      ? settings.enableObservability
      : envEnabled;

    cachedConfig = {
      enabled,
      batchSize: settings.observabilityBatchSize || parseInt(process.env.OBSERVABILITY_BATCH_SIZE || String(DEFAULT_BATCH_SIZE), 10),
      flushIntervalMs: settings.observabilityFlushIntervalMs || parseInt(process.env.OBSERVABILITY_FLUSH_INTERVAL_MS || String(DEFAULT_FLUSH_INTERVAL_MS), 10),
      maxQueueSize: parseInt(process.env.OBSERVABILITY_MAX_QUEUE_SIZE || "1000", 10),
    };
  } catch {
    cachedConfig = {
      enabled: false,
      batchSize: DEFAULT_BATCH_SIZE,
      flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
      maxQueueSize: parseInt(process.env.OBSERVABILITY_MAX_QUEUE_SIZE || "1000", 10),
    };
  }

  cachedConfigTs = Date.now();
  return cachedConfig;
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const sensitiveKeys = ["authorization", "x-api-key", "cookie", "token", "api-key"];
  const sanitized = { ...headers };
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      delete sanitized[key];
    }
  }
  return sanitized;
}

function generateDetailId(model) {
  const timestamp = new Date().toISOString();
  const random = Math.random().toString(36).substring(2, 8);
  const modelPart = model ? model.replace(/[^a-zA-Z0-9-]/g, "-") : "unknown";
  return `${timestamp}-${random}-${modelPart}`;
}

function findDetailTrace(detail) {
  return detail?.providerResponse?.trace
    || detail?.response?.trace
    || detail?.request?.trace
    || null;
}

function findDetailCorrelationId(detail, trace = findDetailTrace(detail)) {
  return detail?.correlationId
    || detail?.request?.correlation_id
    || detail?.request?.correlationId
    || detail?.response?.correlation_id
    || detail?.response?.correlationId
    || detail?.providerResponse?.correlation_id
    || detail?.providerResponse?.correlationId
    || trace?.correlation_id
    || trace?.correlationId
    || null;
}

function summarizeDetailTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return {};

  const promptTokens = tokens.prompt_tokens ?? tokens.input_tokens;
  const completionTokens = tokens.completion_tokens ?? tokens.output_tokens;

  return {
    ...(promptTokens === undefined || promptTokens === null ? {} : { prompt_tokens: Number(promptTokens) }),
    ...(completionTokens === undefined || completionTokens === null ? {} : { completion_tokens: Number(completionTokens) }),
  };
}

function buildTraceSummary(trace) {
  if (!trace || typeof trace !== "object") return null;
  const eventCount = Array.isArray(trace.events) ? trace.events.length : 0;
  const lastEvent = eventCount > 0 ? trace.events[eventCount - 1] : null;
  const mode = trace.mode || null;
  const lastEventType = lastEvent?.type || null;

  if (!mode && !lastEventType && eventCount === 0) return null;

  return {
    mode,
    lastEventType,
    eventCount,
  };
}

function normalizeDetail(detail) {
  const trace = findDetailTrace(detail);
  const normalized = {
    id: detail.id || generateDetailId(detail.model),
    provider: detail.provider || null,
    model: detail.model || null,
    connectionId: detail.connectionId || null,
    correlationId: findDetailCorrelationId(detail, trace),
    timestamp: detail.timestamp || new Date().toISOString(),
    status: detail.status || null,
    latency: detail.latency || {},
    tokens: summarizeDetailTokens(detail.tokens),
    request: detail.request || null,
    providerRequest: detail.providerRequest || null,
    providerResponse: detail.providerResponse || null,
    response: detail.response || null,
    traceSummary: buildTraceSummary(trace),
    endpoint: detail.endpoint || null,
  };

  if (normalized.request?.headers) {
    normalized.request = {
      ...normalized.request,
      headers: sanitizeHeaders(normalized.request.headers),
    };
  }

  return normalized;
}

async function flushQueuedRequestDetails() {
  const existing = getActiveRequestDetailFlush();
  if (existing) await existing;
  const batch = takeRequestDetailBatch();
  if (batch.length === 0) return { written: 0 };

  const active = flushRequestDetailBatch(batch).finally(() => {
    clearActiveRequestDetailFlush();
  });
  setActiveRequestDetailFlush(active);
  return active;
}

export async function saveRequestDetail(detail, options: SaveRequestDetailOptions = {}) {
  if (isCloud) return;
  if (!shouldPersistRequestDetail(detail) && options.propagateError !== true) return;

  const config = await getObservabilityConfig();
  if (!config.enabled) return;

  bootstrapRequestDetailsDb();

  configureRequestDetailQueue({
    batchSize: config.batchSize,
    flushIntervalMs: config.flushIntervalMs,
    maxQueueSize: config.maxQueueSize,
  });

  const normalized = normalizeDetail(detail);
  const shouldForceFlush = options.forceFlush ?? options.propagateError === true;

  enqueueRequestDetailWrite(normalized, flushQueuedRequestDetails);

  if (shouldForceFlush) {
    await flushQueuedRequestDetails();
  }
}

export async function getRequestDetails(filter: RequestDetailsFilter = {}) {
  if (isCloud) {
    return { details: [], pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasNext: false, hasPrev: false } };
  }

  bootstrapRequestDetailsDb();
  const results = await getRequestDetailsIndex(filter);
  const queued = peekRequestDetailQueueItems();
  if (queued.length === 0) return results;
  return {
    ...results,
    details: [...queued, ...results.details].slice(0, filter.pageSize || 50),
  };
}

export async function getKnownProviders() {
  if (isCloud) {
    return [];
  }

  bootstrapRequestDetailsDb();
  return getKnownProvidersFromDb();
}

export async function getRequestDetailById(id) {
  if (isCloud) return null;

  bootstrapRequestDetailsDb();
  const queued = peekRequestDetailQueueItems().find((item) => item.id === id);
  return queued || getRequestDetailByIdFromDb(id);
}

const _shutdownHandler = async () => {
  await drainRequestDetailQueue(flushQueuedRequestDetails, {
    timeoutMs: SHUTDOWN_FLUSH_TIMEOUT_MS,
  });
};

const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
};

const SHUTDOWN_HANDLER_REGISTRY_KEY = Symbol.for("axonrouterPlus.requestDetailsDb.shutdownHandlers");

function getShutdownHandlerRegistry() {
  if (!globalThis[SHUTDOWN_HANDLER_REGISTRY_KEY]) {
    globalThis[SHUTDOWN_HANDLER_REGISTRY_KEY] = {
      beforeExit: null,
      SIGINT: null,
      SIGTERM: null,
    };
  }

  return globalThis[SHUTDOWN_HANDLER_REGISTRY_KEY];
}

const _signalHandlers = {
  SIGINT: async () => {
    try {
      await _shutdownHandler();
    } finally {
      process.exit(SIGNAL_EXIT_CODES.SIGINT);
    }
  },
  SIGTERM: async () => {
    try {
      await _shutdownHandler();
    } finally {
      process.exit(SIGNAL_EXIT_CODES.SIGTERM);
    }
  },
};

function ensureShutdownHandler() {
  if (isCloud) return;

  const registry = getShutdownHandlerRegistry();

  if (registry.beforeExit) process.off("beforeExit", registry.beforeExit);
  if (registry.SIGINT) process.off("SIGINT", registry.SIGINT);
  if (registry.SIGTERM) process.off("SIGTERM", registry.SIGTERM);

  process.on("beforeExit", _shutdownHandler);
  process.on("SIGINT", _signalHandlers.SIGINT);
  process.on("SIGTERM", _signalHandlers.SIGTERM);

  registry.beforeExit = _shutdownHandler;
  registry.SIGINT = _signalHandlers.SIGINT;
  registry.SIGTERM = _signalHandlers.SIGTERM;
}

ensureShutdownHandler();

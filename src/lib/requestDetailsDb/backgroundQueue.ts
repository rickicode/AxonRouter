const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 500;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2000;
const DEFAULT_MAX_QUEUE_SIZE = 1000;

type RequestDetailQueueConfig = {
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
};

const queueState = global.__requestDetailsHybridQueue ??= {
  items: [],
  flushTimer: null,
  activeFlush: null,
  maxBatchSize: DEFAULT_BATCH_SIZE,
  flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
  maxQueueSize: DEFAULT_MAX_QUEUE_SIZE,
};

function scheduleFlush(flushFn) {
  if (queueState.flushTimer) return;
  queueState.flushTimer = setTimeout(() => {
    queueState.flushTimer = null;
    void flushFn();
  }, queueState.flushIntervalMs);
  if (queueState.flushTimer.unref) queueState.flushTimer.unref();
}

export function configureRequestDetailQueue({ batchSize, flushIntervalMs, maxQueueSize }: RequestDetailQueueConfig = {}) {
  if (Number.isFinite(batchSize) && batchSize > 0) {
    queueState.maxBatchSize = Math.max(1, Math.floor(batchSize));
  }
  if (Number.isFinite(flushIntervalMs) && flushIntervalMs > 0) {
    queueState.flushIntervalMs = Math.max(10, Math.floor(flushIntervalMs));
  }
  if (Number.isFinite(maxQueueSize) && maxQueueSize > 0) {
    queueState.maxQueueSize = Math.max(10, Math.floor(maxQueueSize));
  }
}

export function enqueueRequestDetailWrite(item, flushFn) {
  if (queueState.items.length >= queueState.maxQueueSize) {
    console.warn("[requestDetailsDb] Queue full, dropping oldest item");
    queueState.items.shift();
  }

  queueState.items.push(item);
  if (queueState.items.length >= queueState.maxBatchSize) {
    void flushFn();
  } else {
    scheduleFlush(flushFn);
  }
}

export function takeRequestDetailBatch() {
  if (queueState.items.length === 0) return [];
  return queueState.items.splice(0, queueState.maxBatchSize);
}

export function setActiveRequestDetailFlush(promise) {
  queueState.activeFlush = promise;
}

export function clearActiveRequestDetailFlush() {
  queueState.activeFlush = null;
}

export function getActiveRequestDetailFlush() {
  return queueState.activeFlush;
}

export function peekRequestDetailQueueItems() {
  return [...queueState.items];
}

export async function drainRequestDetailQueue(flushFn, { timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS } = {}) {
  if (queueState.flushTimer) {
    clearTimeout(queueState.flushTimer);
    queueState.flushTimer = null;
  }

  const drainPromise = (async () => {
    while (queueState.items.length > 0 || queueState.activeFlush) {
      await flushFn();
      if (queueState.activeFlush) {
        await queueState.activeFlush;
      }
    }
  })();

  await Promise.race([
    drainPromise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

import { flushUsageWriteBatch } from "./writer";

const DEFAULT_MAX_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL_MS = 200;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2000;
const MAX_QUEUE_SIZE = 5000;
const MAX_FLUSH_RETRIES = 10;
const MAX_FLUSH_BACKOFF_MS = 30000;

const queueState = global.__usageDbQueueState ??= {
  items: [],
  flushTimer: null,
  activeFlush: null,
  maxBatchSize: DEFAULT_MAX_BATCH_SIZE,
  flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
  retryCount: 0,
};

function scheduleFlush() {
  if (queueState.flushTimer) return;
  queueState.flushTimer = setTimeout(() => {
    queueState.flushTimer = null;
    void flushUsageQueue();
  }, queueState.flushIntervalMs);
  if (queueState.flushTimer.unref) queueState.flushTimer.unref();
}

export function enqueueUsageWrite(item) {
  if (!item || typeof item !== "object") return false;

  if (queueState.items.length >= MAX_QUEUE_SIZE) {
    const dropIndex = queueState.items.findIndex((queuedItem) => queuedItem?.kind === "log");
    if (dropIndex >= 0) {
      queueState.items.splice(dropIndex, 1);
    } else {
      queueState.items.shift();
    }
  }

  queueState.items.push(item);

  if (queueState.items.length >= queueState.maxBatchSize) {
    void flushUsageQueue();
  } else {
    scheduleFlush();
  }

  return true;
}

export function getUsageQueueStats() {
  return {
    queued: queueState.items.length,
    flushing: Boolean(queueState.activeFlush),
    maxBatchSize: queueState.maxBatchSize,
    flushIntervalMs: queueState.flushIntervalMs,
  };
}

export async function flushUsageQueue() {
  if (queueState.activeFlush) {
    return queueState.activeFlush;
  }

  if (queueState.items.length === 0) {
    return { usageEvents: 0, requestLogs: 0 };
  }

  const batch = queueState.items.splice(0, queueState.maxBatchSize);
  queueState.activeFlush = (async () => {
    try {
      const result = await flushUsageWriteBatch(batch);
      queueState.retryCount = 0;
      queueState.flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS;
      return result;
    } catch (error) {
      queueState.retryCount += 1;
      if (queueState.retryCount > MAX_FLUSH_RETRIES) {
        console.error("[usageDb] Max retries exceeded, dropping", batch.length, "items:", (error as Error)?.message || error);
        queueState.retryCount = 0;
        queueState.flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS;
      } else {
        queueState.items.unshift(...batch);
        queueState.flushIntervalMs = Math.min(queueState.flushIntervalMs * 2, MAX_FLUSH_BACKOFF_MS);
        console.warn("[usageDb] Flush failed (retry", queueState.retryCount + "/" + MAX_FLUSH_RETRIES + "), backoff", queueState.flushIntervalMs + "ms:", (error as Error)?.message || error);
      }
      return { usageEvents: 0, requestLogs: 0 };
    } finally {
      queueState.activeFlush = null;
      if (queueState.items.length > 0) {
        scheduleFlush();
      }
    }
  })();

  return queueState.activeFlush;
}

export async function drainUsageQueue({ timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS } = {}) {
  if (queueState.flushTimer) {
    clearTimeout(queueState.flushTimer);
    queueState.flushTimer = null;
  }

  const drainPromise = (async () => {
    let iterations = 0;
    while ((queueState.items.length > 0 || queueState.activeFlush) && iterations < 100) {
      iterations++;
      await flushUsageQueue();
      if (queueState.activeFlush) {
        await queueState.activeFlush;
      }
    }
  })();

  await Promise.race([
    drainPromise,
    new Promise((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}

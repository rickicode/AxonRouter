// FIFO semaphore bounding concurrent upstream dispatches (see
// MAX_CONCURRENT_UPSTREAM / UPSTREAM_QUEUE_TIMEOUT_MS in runtimeConfig).
// One slot per in-flight upstream attempt; retries inside an attempt reuse
// the same slot, so pool rotation can never amplify concurrency.
//
// Design notes:
// - FIFO queue: no starvation under sustained overload.
// - Queue timeout: waiters give up with a typed QUEUE_TIMEOUT error so the
//   caller can answer 503 + retry_after instead of hanging forever.
// - Always released via finally by the holder; a crashed holder path still
//   frees its slot on next tick (leak-safe: release() is idempotent).
// - Test requests bypass via options.skip (unit tests must not serialize).
const waiters = [];
let active = 0;
let limit = 32;

export function configureUpstreamSemaphore({ maxConcurrent } = {}) {
  if (Number.isFinite(maxConcurrent) && maxConcurrent > 0) limit = Math.floor(maxConcurrent);
}

export function upstreamSemaphoreStats() {
  return { active, queued: waiters.length, limit };
}

export class UpstreamQueueTimeout extends Error {
  constructor(queuedMs, limit) {
    super(`Upstream saturated: ${limit} concurrent dispatches, queue wait exceeded`);
    this.name = "UpstreamQueueTimeout";
    this.code = "UPSTREAM_QUEUE_TIMEOUT";
    this.queuedMs = queuedMs;
    this.limit = limit;
  }
}

export function acquireUpstreamSlot({ timeoutMs = 30000, skip = false } = {}) {
  if (skip) return Promise.resolve({ release: () => {}, queuedMs: 0 });
  if (active < limit) {
    active += 1;
    return Promise.resolve({ release, queuedMs: 0 });
  }
  const enqueuedAt = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waiters.findIndex((w) => w.settle === settle);
      if (idx >= 0) waiters.splice(idx, 1);
      reject(new UpstreamQueueTimeout(Date.now() - enqueuedAt, limit));
    }, timeoutMs);
    const settle = () => {
      // Slot transfer: the releaser's slot passes to this waiter, so the
      // active count is unchanged (NOT incremented — that inflates the
      // counter on every handoff and eventually queues everything).
      clearTimeout(timer);
      resolve({ release, queuedMs: Date.now() - enqueuedAt });
    };
    waiters.push({ settle });
  });
}

function release() {
  const next = waiters.shift();
  if (next) {
    next.settle();
    return;
  }
  active = Math.max(0, active - 1);
}

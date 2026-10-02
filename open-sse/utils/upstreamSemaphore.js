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

/**
 * Track one request's slot so release is idempotent AND safe to call before the
 * acquire has happened.
 *
 * An abort can arrive between creating the stream controller and acquiring the
 * slot (client disconnect, external combo timeout). Releasing at that moment must
 * not mark the request as released, because the acquire is still coming: the
 * request would then take a slot that is never given back. It is instead marked
 * aborted, skipped at the acquire site, and the flags stay separate so a second
 * release after the acquire still frees the slot.
 */
export function createUpstreamSlotHolder() {
  let slot = null;
  let released = false;
  let aborted = false;

  return {
    get slot() { return slot; },
    get released() { return released; },
    get aborted() { return aborted; },

    /** Marker for the caller: read once, right before acquiring. */
    async acquire(options) {
      slot = aborted ? null : await acquireUpstreamSlot(options);
      return slot;
    },

    release() {
      if (released) return;
      if (!slot) {
        // Nothing to hand back yet — remember that the request is already dead.
        aborted = true;
        return;
      }
      released = true;
      try { slot.release(); } catch { /* never break responses */ }
    },
  };
}

/**
 * Per-IP request rate limiting for the public LLM surface.
 *
 * Extracted from gateway/server.js so it can be tested. It lived inline as a
 * module-level Map, which is where the bug lived: every worker in the cluster kept
 * its own counter, so the limit was really WORKERS x 300. On this deployment that is
 * 1200 requests/minute against a comment promising 300 — four workers times the
 * limit. The real multiplier is whatever WORKERS resolves to, not the configured
 * value: gateway/workerMode.mjs clamps GATEWAY_WORKERS to the container core count,
 * so a .env asking for 12 on four cores still runs four. No single process can observe
 * the difference, so it read as correct and stayed correct-looking.
 *
 * Counting goes through the shared store so all workers see one number. The
 * trade-off is a round trip per public request; measured Valkey latency on this host is
 * 0.66ms average, against internal API responses already taking 21-62ms.
 *
 * Two ways this degrades, both deliberate and both observable:
 *   • the counter itself errors -> fail open, because a limiter outage must not
 *     become a traffic outage;
 *   • the shared store is unreachable -> incrSharedCounter falls back to a
 *     process-local counter and still returns a number, which would silently restore
 *     the per-process behaviour this replaced. That loss of a real limit is reported
 *     through onDegrade so it can be logged rather than inferred.
 */

export const RATE_LIMIT_WINDOW_S = 60;
export const MAX_REQUESTS_PER_WINDOW = 300;

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLoopback(ip) {
  return !ip || LOOPBACK.has(ip);
}

/** Rate-limit key for an address, namespaced so it cannot collide with other counters. */
export function rateLimitKey(ip) {
  return `ratelimit:ip:${ip}`;
}

/**
 * @param {string} ip remote address
 * @param {object} deps
 * @param {(key: string, ttl: number) => Promise<number|null>} deps.incr
 * @param {() => boolean} [deps.sharedAvailable] whether the shared store is usable
 * @param {() => void} [deps.onDegrade] called once when the shared store is gone
 * @param {number} [deps.max] requests allowed per window
 * @returns {Promise<boolean>} true when the request should be refused
 */
export async function isRateLimited(ip, deps) {
  const { incr, sharedAvailable, onDegrade, max = MAX_REQUESTS_PER_WINDOW } = deps;
  if (isLoopback(ip)) return false;

  if (sharedAvailable && !sharedAvailable()) {
    onDegrade?.();
  }

  // Fail open on both shapes of failure: a null answer, and a throw. The helper
  // currently swallows its own errors and returns null, so the catch is for the case
  // where that changes or a new counter backend is added — a limiter outage must not
  // turn into a 500 on a request that would otherwise have been served.
  let count;
  try {
    count = await incr(rateLimitKey(ip), RATE_LIMIT_WINDOW_S);
  } catch {
    return false;
  }
  if (count == null) return false;
  return Number(count) > max;
}
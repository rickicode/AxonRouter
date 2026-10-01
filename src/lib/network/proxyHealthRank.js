// Proxy pool candidate ranking by measured health.
//
// Deliberately a separate module from proxyHealth.js, which owns the runtime
// failure counters and the disabled/degraded/dead escalation. This file only
// answers one question — given a list of candidate pool ids and what is known
// about each one's health, which ones should be taken out of the running.
//
// Why ranking at pick time rather than relying on the counters in proxyHealth.js:
// that mechanism disables a pool after 3 consecutive failures, which assumes a
// small pool set. The Bright Data feeds behind the `superproxy` and `proxy100`
// groups return ~1000 proxies each and replace the whole set every five minutes,
// so a given pool is picked roughly once every 45 minutes at current traffic — it
// can never accumulate three consecutive failures — and the replacement wipes
// whatever state had built up. Those feeds also return roughly a quarter unusable
// proxies (isp_proxy1 / isp_shared1 / unblocker1 measured 0/24 answering, against
// datacenter_shared1 12/12 and datacenter_proxy1 10/12).
//
// So the verdict is produced continuously by proxyHealthSweep.js and applied here,
// which survives a re-import: a freshly inserted dead proxy is skipped as soon as
// it has been probed once, with no human involved and nothing to undo.
//
// The vocabulary is the one computeProxyTestHealth() in proxyHealth.js already
// writes into proxy_pools.test_status, so this ranks consistently with the rest of
// the system:
//
//   good     'active'
//   bad      'degraded' | 'unhealthy' | 'dead' | 'failed'
//   unknown  'unknown', empty, or any word not listed above
//
// 'unknown' is deliberately not bad: most pools have never been probed (3152 of
// 3442 when this was written) and a ranker that punished them would leave a fresh
// install with nothing to pick.
//
// Deliberately dependency-free — it does not import proxyHealth.js, so the picker
// can use it without pulling in the shared-counter client that module needs.
export const PROXY_HEALTH_GOOD = new Set(["active"]);

export const PROXY_HEALTH_BAD = new Set(["dead", "unhealthy", "degraded", "failed"]);

/**
 * @param {unknown} status proxy_pools.test_status
 * @returns {"good" | "bad" | "unknown"}
 */
export function classifyProxyHealth(status) {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!s) return "unknown";
  if (PROXY_HEALTH_GOOD.has(s)) return "good";
  if (PROXY_HEALTH_BAD.has(s)) return "bad";
  return "unknown";
}

/** Read a pool's health from a pool row or a bare test_status string. */
export function proxyHealthOf(pool) {
  if (pool == null) return "unknown";
  if (typeof pool === "string") return classifyProxyHealth(pool);
  return classifyProxyHealth(pool.testStatus ?? pool.test_status);
}

/**
 * Drop candidates that are known-bad, keeping the rest in their original order.
 *
 * The deliberate choice is to NOT restrict the pick to known-good pools. An earlier
 * version ranked good > unknown > bad and returned only the good tier when one
 * existed; with the sweep still filling in its verdicts that concentrated every
 * request onto the ~100 pools already confirmed while ~2,400 untested pools sat
 * idle, which is its own failure mode — a handful of egress IPs taking all the
 * traffic until they start tripping per-IP rate limits of their own. Excluding what
 * is known dead is the part that actually removes the failures; leaving everything
 * else in play keeps the load spread while the sweep keeps learning.
 *
 * Input order is preserved, because the caller's round-robin index and sticky state
 * are positional — re-sorting would silently reshuffle that state.
 *
 * Fail-open by contract, matching fitPoolIds: with no health information at all the
 * input comes back untouched, so a caller that knows nothing about pool health
 * behaves exactly as it did before.
 *
 * @param {string[]} ids candidate pool ids
 * @param {Map<string, unknown>|Record<string, unknown>|null} health pool id -> row|status
 * @returns {string[]}
 */
export function rankPoolsByHealth(ids, health) {
  if (!Array.isArray(ids) || ids.length <= 1) return Array.isArray(ids) ? ids : [];
  if (!health) return ids;

  let read;
  if (typeof health.get === "function") {
    read = (id) => health.get(id);
  } else if (typeof health === "object") {
    read = (id) => health[id];
  } else {
    return ids;
  }

  const usable = [];
  const bad = [];
  let sawAnyStatus = false;

  for (const id of ids) {
    const raw = read(id);
    if (raw != null && raw !== "") sawAnyStatus = true;
    (proxyHealthOf(raw) === "bad" ? bad : usable).push(id);
  }

  // Nothing known about any of them: behave exactly as before.
  if (!sawAnyStatus) return ids;
  if (usable.length) return usable;
  // Every candidate is known-bad. Returning them keeps a request alive instead of
  // failing for want of a pool; the next sweep re-probes and promotes them back.
  return bad;
}

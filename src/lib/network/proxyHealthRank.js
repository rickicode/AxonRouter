// Proxy pool candidate ranking by measured health.
//
// Deliberately a separate module from proxyHealth.js, which owns the runtime
// failure counters and the disabled/degraded/dead escalation. This file only
// answers one question — given a list of candidate pool ids and what is known
// about each one's health, which subset should be preferred right now.
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
 * Order candidate pool ids so known-good ones are considered first, dropping to the
 * next tier only when the better tier is empty. Input order is preserved within a
 * tier, because the caller's round-robin index and sticky state are positional —
 * re-sorting inside a tier would silently reshuffle that state.
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

  const good = [];
  const unknown = [];
  const bad = [];
  let sawAnyStatus = false;

  for (const id of ids) {
    const raw = read(id);
    if (raw != null && raw !== "") sawAnyStatus = true;
    const bucket = proxyHealthOf(raw);
    if (bucket === "good") good.push(id);
    else if (bucket === "bad") bad.push(id);
    else unknown.push(id);
  }

  // Nothing known about any of them: behave exactly as before.
  if (!sawAnyStatus) return ids;
  if (good.length) return good;
  if (unknown.length) return unknown;
  // Every candidate is known-bad. Returning them keeps a request alive instead of
  // failing for want of a pool; the next sweep re-probes and promotes them back.
  return bad;
}

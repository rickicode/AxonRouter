// Which providers the usage topology graph shows.
//
// Extracted from ProviderTopology.js so the retention rule is testable on its own:
// the component is JSX and this repo has no DOM test harness, which is exactly how
// the rule came to be broken in the first place — the selection was inlined in a
// `useMemo` nobody could unit-test, so nothing caught that it ignored the
// retention set.
//
// The rule: a provider is visible while it is active, and stays visible for
// RETENTION_MS after its last request, so a provider whose request just finished
// drops to standby instead of blinking out of existence. After that it leaves the
// graph. RETENTION_MS matches the window the component's own pruning interval
// enforces, so what is shown and what is retained cannot disagree.
export const RETENTION_MS = 5 * 60 * 1000;

/**
 * @param {Array<{provider?: string}>} providers catalogue entries
 * @param {Set<string>} usedProviderSet lowercase provider ids that are active or
 *   still inside the retention window (maintained by the caller)
 * @returns {Array<object>} the providers to render, catalogue shape where known
 */
export function selectVisibleProviders(providers, usedProviderSet) {
  const used = usedProviderSet instanceof Set ? usedProviderSet : new Set(usedProviderSet || []);
  if (used.size === 0) return [];

  const list = Array.isArray(providers) ? providers : [];
  const matched = list.filter((p) => used.has(String(p?.provider || "").toLowerCase()));
  if (matched.length > 0) return matched;

  // A provider that served traffic without a catalogue entry still gets a node, so
  // a request is never invisible just because the provider is unregistered.
  return Array.from(used).map((id) => ({ provider: id }));
}

/**
 * Fold a set of freshly-active providers into the retained set, and drop entries
 * whose retention window has closed. Pure, so the component can call it from a
 * timer without owning the bookkeeping.
 *
 * @param {Record<string, number>} lastUsedAt provider id -> last-active epoch ms
 * @param {Iterable<string>} activeIds currently active provider ids
 * @param {number} now
 * @param {number} [retentionMs]
 * @returns {{lastUsedAt: Record<string, number>, visible: Set<string>}}
 */
export function advanceRetention(lastUsedAt, activeIds, now, retentionMs = RETENTION_MS) {
  const stamps = { ...(lastUsedAt || {}) };

  for (const id of activeIds || []) {
    if (id) stamps[id] = now;
  }
  // Prune first so a provider that is active again this tick is not evicted by its
  // own stale timestamp before being re-stamped.
  for (const id of Object.keys(stamps)) {
    if (now - stamps[id] >= retentionMs) delete stamps[id];
  }

  const visible = new Set();
  for (const [id, at] of Object.entries(stamps)) {
    if (now - at < retentionMs) visible.add(id);
  }
  // An active provider is visible regardless of its timestamp: retention governs
  // how long it lingers AFTER it goes idle, never whether live traffic is shown.
  for (const id of activeIds || []) {
    if (id) visible.add(id);
  }

  return { lastUsedAt: stamps, visible };
}

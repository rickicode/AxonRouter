// Zone-level proxy health, learned from probe results.
//
// Probing pool-by-pool cannot converge here. The Bright Data feeds behind the
// `superproxy` and `proxy100` groups replace roughly 2000 proxies every five
// minutes, while a sweep pass can only probe a couple of hundred — so more than
// half of any pass is replaced before it is reached, and the pools that do get
// probed are a thin, evenly-spread sample. Measured per zone that sample is already
// decisive, though: isp_proxy1, isp_shared1 and unblocker1 answered 0/24 across two
// independent samples, while datacenter_shared1 answered 12/12 and datacenter_proxy1
// 10/12.
//
// So the unit of health is the zone, not the pool. A zone that fails its sample
// overwhelmingly is recorded once and every pool in it is skipped at pick time —
// which survives the re-import, because the verdict is keyed by the zone that appears
// in the proxy URL rather than by a pool id that is replaced every cycle.
//
// This is learned from measurement, not a hardcoded deny list: nothing here names a
// zone. A zone becomes suspect only after enough probes have failed in it, and it is
// re-probed on a shorter cycle so a provider that starts working again comes back
// without anyone intervening. Verdicts live in the shared cache so every process sees
// them, on a TTL so a stale verdict cannot wedge routing.
import { cacheGetRaw, cacheSetRaw, isCacheAvailable } from "@/lib/cache/client.js";

const ZONE_KEY_PREFIX = "proxy:zonehealth:";

// A zone is condemned on this share of failures, and only once it has enough probes
// behind it for the share to mean something.
const FAILURE_THRESHOLD = 0.8;
const MIN_SAMPLES = 4;
// Enough samples to also forgive a zone again: a zone condemned on 4/4 failing needs
// a few consecutive passes of good answers before traffic is trusted back.
const RECOVERY_SAMPLES = 3;

// Storage TTL for the tally, and how long a verdict stays actionable without a fresh
// probe.
//
// These are deliberately separate, and conflating them was a real bug: the tally was
// originally stored under a 3-minute TTL on the reasoning that a condemned zone
// should be re-checked soon. But the TTL also destroyed the accumulated samples, so
// every dead zone restarted from zero evidence each cycle and flipped between
// "bad" and "unknown" — the tally never got past a handful of probes, and the picker
// oscillated with it, which is why transport failures kept coming back.
//
// So: the tally is kept for hours, and a verdict stops counting once no probe has
// touched it for FRESH_MS. A dead zone therefore goes quiet rather than being
// condemned forever, and the moment a probe does arrive the verdict returns at once
// because the evidence was never thrown away.
const VERDICT_TTL_S = 6 * 60 * 60;
const FRESH_MS = 10 * 60 * 1000;

/**
 * The zone a proxy URL belongs to, or "" when it has none (relay pools).
 * Deliberately derived from the URL so it stays correct across a pool being
 * re-created with the same credentials.
 */
export function proxyZoneKey(proxyUrl) {
  const m = /zone-([a-z0-9_]+)/i.exec(String(proxyUrl || ""));
  return m ? m[1].toLowerCase() : "";
}

function zoneKey(zone) {
  return `${ZONE_KEY_PREFIX}${zone}`;
}

function verdictOf(raw) {
  if (!raw) return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v !== "object") return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * Fold one probe result into its zone's running tally.
 *
 * Called on every sweep probe, so it must be cheap and must never throw: a cache
 * outage degrades to "no zone verdicts", which is the pre-existing behaviour.
 *
 * @param {string} proxyUrl
 * @param {boolean} ok
 * @returns {Promise<{zone: string, state: string, samples: number, failRate: number}|null>}
 */
export async function recordZoneProbe(proxyUrl, ok) {
  const zone = proxyZoneKey(proxyUrl);
  if (!zone) return null;
  try {
    if (!isCacheAvailable()) return null;
    const key = zoneKey(zone);
    const prev = verdictOf(await cacheGetRaw(key)) || { samples: 0, fails: 0, okStreak: 0 };
    const next = {
      samples: Math.min(1000, (prev.samples || 0) + 1),
      fails: (prev.fails || 0) + (ok ? 0 : 1),
      okStreak: ok ? (prev.okStreak || 0) + 1 : 0,
      updatedAt: Date.now(),
    };

    const failRate = next.samples ? next.fails / next.samples : 0;
    const wasBad = prev.state === "bad";
    if (next.samples >= MIN_SAMPLES && failRate >= FAILURE_THRESHOLD) {
      next.state = "bad";
    } else if (next.state === "bad" && next.okStreak >= RECOVERY_SAMPLES && failRate < FAILURE_THRESHOLD) {
      next.state = "good";
    } else {
      next.state = next.state || "unknown";
    }

    // A stale verdict is not a verdict: if nothing has probed this zone recently the
    // tally is history, not evidence about the egress we are routing over right now.
    const fresh = Number.isFinite(next.updatedAt) && Date.now() - next.updatedAt <= FRESH_MS;
    if (!fresh) {
      next.state = "unknown";
    } else if (next.samples >= MIN_SAMPLES && failRate >= FAILURE_THRESHOLD) {
      next.state = "bad";
    } else if (next.state === "bad" && next.okStreak >= RECOVERY_SAMPLES && failRate < FAILURE_THRESHOLD) {
      next.state = "good";
    } else {
      next.state = next.state || "unknown";
    }

    await cacheSetRaw(key, JSON.stringify(next), VERDICT_TTL_S);
    // `newlyBad` distinguishes a fresh condemnation from a zone that was already
    // condemned. Without it the sweep log re-reports the same zones on every pass,
    // which reads as a fresh decision each time and hides the fact that a zone can
    // also be forgiven — datacenter_proxy1 was condemned on its first samples and
    // then recovered, and the log showed it as condemned throughout.
    return { zone, state: next.state, samples: next.samples, failRate, newlyBad: next.state === "bad" && !wasBad };
  } catch {
    return null;
  }
}

/**
 * Zone verdicts for a set of pool rows, as a Map of zone -> "bad" | "unknown" | "good".
 * Only "bad" is actionable. Missing cache means an empty map, and the picker then
 * behaves exactly as it did before this existed.
 *
 * @param {Iterable<{proxyUrl?: string}>} pools
 * @returns {Promise<Map<string, string>>}
 */
export async function getBadZones(pools) {
  const out = new Map();
  try {
    if (!isCacheAvailable()) return out;
    const zones = new Set();
    for (const p of pools || []) {
      const z = proxyZoneKey(p?.proxyUrl);
      if (z) zones.add(z);
    }
    if (zones.size === 0) return out;
    const verdicts = await Promise.all(
      [...zones].map(async (z) => [z, verdictOf(await cacheGetRaw(zoneKey(z)))])
    );
    for (const [zone, verdict] of verdicts) {
      // Same freshness rule on the read path, so a verdict nobody has re-probed
      // cannot keep steering traffic indefinitely.
      const fresh = Number.isFinite(verdict?.updatedAt) && Date.now() - verdict.updatedAt <= FRESH_MS;
      if (verdict?.state === "bad" && fresh) out.set(zone, "bad");
    }
    return out;
  } catch {
    return out;
  }
}

/** Test seam: drop a zone verdict. */
export async function clearZoneHealth(zone) {
  if (!zone) return;
  try {
    const { cacheDelRaw } = await import("@/lib/cache/client.js");
    await cacheDelRaw(zoneKey(zone));
  } catch {
    /* fail-open */
  }
}

// In-process memo so the picker can consult zone verdicts without a cache round-trip
// per request. 30s is short enough that a newly condemned zone takes effect almost
// immediately, and long enough that this is a map lookup on the hot path rather than
// a Valkey GET. Keyed by the zone set it was computed for, so a different group does
// not read another group's verdicts.
const LOCAL_TTL_MS = 30_000;
let localCache = { key: "", at: 0, zones: new Map() };

/**
 * Zone verdicts for a set of pool rows, memoised in-process.
 * @param {Array<{proxyUrl?: string}>} pools
 * @returns {Promise<Map<string, string>>} zone -> "bad" for condemned zones only
 */
export async function getBadZonesCached(pools) {
  const zones = new Set();
  for (const p of pools || []) {
    const z = proxyZoneKey(p?.proxyUrl);
    if (z) zones.add(z);
  }
  const key = [...zones].sort().join(",");
  if (!key) return new Map();

  const now = Date.now();
  if (localCache.key === key && now - localCache.at < LOCAL_TTL_MS) return localCache.zones;

  const zonesMap = await getBadZones(pools);
  localCache = { key, at: now, zones: zonesMap };
  return zonesMap;
}

/** Test seam: drop the in-process memo. */
export function resetZoneHealthCache() {
  localCache = { key: "", at: 0, zones: new Map() };
}

export const ZONE_FAILURE_THRESHOLD = FAILURE_THRESHOLD;
export const ZONE_MIN_SAMPLES = MIN_SAMPLES;
export const ZONE_FRESH_MS = FRESH_MS;

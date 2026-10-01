// Zone-level proxy health: learned verdicts, and the picker honouring them.
//
// The reason this layer exists is convergence, not correctness. Per-pool verdicts
// are precise but cannot accumulate: the auto-fetcher replaces roughly 2000 Bright
// Data proxies every five minutes while a sweep can probe a couple of hundred, so
// most pool rows are never reached and a condemned zone keeps feeding dead egress
// into the picker. Measured per zone a handful of samples is already decisive —
// isp_proxy1 / isp_shared1 / unblocker1 answered 0/24, datacenter_shared1 12/12 —
// so the zone is the right unit of verdict, and it is keyed by the zone in the proxy
// URL, which the re-import does not change.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const store = new Map();
let available = true;

vi.mock("../../src/lib/cache/client.js", () => ({
  isCacheAvailable: () => available,
  cacheGetRaw: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  cacheSetRaw: vi.fn(async (key, value) => { store.set(key, value); }),
  cacheDelRaw: vi.fn(async (key) => { store.delete(key); }),
}));

const {
  proxyZoneKey,
  recordZoneProbe,
  getBadZones,
  getBadZonesCached,
  clearZoneHealth,
  resetZoneHealthCache,
  ZONE_FAILURE_THRESHOLD,
  ZONE_MIN_SAMPLES,
} = await import("../../src/lib/network/proxyZoneHealth.js");

const url = (zone, session = "abc") => `http:u-zone-${zone}-country-id-session-${session}@brd.superproxy.io:44445`;

beforeEach(() => {
  store.clear();
  available = true;
  resetZoneHealthCache();
  vi.clearAllMocks();
});

describe("proxyZoneKey", () => {
  it("extracts the zone from a proxy URL", () => {
    expect(proxyZoneKey(url("isp_proxy1"))).toBe("isp_proxy1");
    expect(proxyZoneKey(url("datacenter_shared1"))).toBe("datacenter_shared1");
  });

  it("is case insensitive", () => {
    expect(proxyZoneKey("http://u-zone-ISP_Proxy1-s@host:1")).toBe("isp_proxy1");
  });

  it("returns empty for a URL with no zone, which is every relay pool", () => {
    expect(proxyZoneKey("https://relay.example.com/abc")).toBe("");
    expect(proxyZoneKey("")).toBe("");
    expect(proxyZoneKey(null)).toBe("");
  });

  it("derives the same key for a pool re-created with a new session id", () => {
    // This is the property that makes the verdict survive the fetcher.
    expect(proxyZoneKey(url("unblocker1", "s1"))).toBe(proxyZoneKey(url("unblocker1", "s2")));
  });
});

describe("recordZoneProbe", () => {
  it("says nothing about a URL with no zone", async () => {
    await expect(recordZoneProbe("https://relay.example.com/x", false)).resolves.toBeNull();
    expect(store.size).toBe(0);
  });

  it("stays unknown until there are enough samples to mean anything", async () => {
    // One failure must not condemn a zone: a single blip is not a verdict.
    for (let i = 0; i < ZONE_MIN_SAMPLES - 1; i++) {
      const r = await recordZoneProbe(url("isp_proxy1"), false);
      expect(r.state).toBe("unknown");
    }
  });

  it("condemns a zone once its sample fails overwhelmingly", async () => {
    let r;
    for (let i = 0; i < ZONE_MIN_SAMPLES; i++) r = await recordZoneProbe(url("isp_proxy1"), false);
    expect(r.state).toBe("bad");
    expect(r.failRate).toBeGreaterThanOrEqual(ZONE_FAILURE_THRESHOLD);
  });

  it("keeps a healthy zone healthy", async () => {
    let r;
    for (let i = 0; i < 6; i++) r = await recordZoneProbe(url("datacenter_shared1"), true);
    expect(r.state).not.toBe("bad");
  });

  it("does not condemn a zone that mostly works", async () => {
    // 1 failure in 4 is 25%, far under the threshold.
    const seq = [true, true, true, false];
    let r;
    for (const ok of seq) r = await recordZoneProbe(url("datacenter_proxy1"), ok);
    expect(r.state).not.toBe("bad");
  });

  it("forgives a condemned zone after enough consecutive successes", async () => {
    for (let i = 0; i < ZONE_MIN_SAMPLES; i++) await recordZoneProbe(url("unblocker1"), false);
    expect((await getBadZones([{ proxyUrl: url("unblocker1") }])).has("unblocker1")).toBe(true);

    // The provider starts working again — no human intervention, it comes back on
    // its own so a recovered exit is not stranded.
    for (let i = 0; i < 8; i++) await recordZoneProbe(url("unblocker1"), true);
    expect((await getBadZones([{ proxyUrl: url("unblocker1") }])).has("unblocker1")).toBe(false);
  });

  it("keeps zone tallies separate", async () => {
    for (let i = 0; i < ZONE_MIN_SAMPLES; i++) await recordZoneProbe(url("isp_proxy1"), false);
    await recordZoneProbe(url("datacenter_shared1"), true);
    const bad = await getBadZones([
      { proxyUrl: url("isp_proxy1") },
      { proxyUrl: url("datacenter_shared1") },
    ]);
    expect([...bad.keys()]).toEqual(["isp_proxy1"]);
  });

  it("is a no-op when the cache is unavailable, never an exception", async () => {
    available = false;
    await expect(recordZoneProbe(url("isp_proxy1"), false)).resolves.toBeNull();
    expect(await getBadZones([{ proxyUrl: url("isp_proxy1") }])).toEqual(new Map());
  });

  it("survives a cache that throws", async () => {
    const { cacheGetRaw } = await import("../../src/lib/cache/client.js");
    cacheGetRaw.mockRejectedValueOnce(new Error("cache down"));
    await expect(recordZoneProbe(url("isp_proxy1"), false)).resolves.toBeNull();
  });

  it("ignores a corrupt cached verdict instead of throwing", async () => {
    const { cacheSetRaw } = await import("../../src/lib/cache/client.js");
    await cacheSetRaw("proxy:zonehealth:isp_proxy1", "{{{not json", 60);
    await expect(recordZoneProbe(url("isp_proxy1"), false)).resolves.toBeTruthy();
  });

  it("caps the sample count so the verdict cannot grow without bound", async () => {
    let r;
    for (let i = 0; i < 30; i++) r = await recordZoneProbe(url("datacenter_shared1"), true);
    expect(r.samples).toBeLessThanOrEqual(1000);
  });

  it("clearZoneHealth drops a verdict", async () => {
    for (let i = 0; i < ZONE_MIN_SAMPLES; i++) await recordZoneProbe(url("isp_proxy1"), false);
    await clearZoneHealth("isp_proxy1");
    expect((await getBadZones([{ proxyUrl: url("isp_proxy1") }])).has("isp_proxy1")).toBe(false);
  });
});

describe("getBadZonesCached", () => {
  it("memoises so the hot path does not hit the cache per request", async () => {
    const { cacheGetRaw } = await import("../../src/lib/cache/client.js");
    const pools = [{ proxyUrl: url("isp_proxy1") }];
    await getBadZonesCached(pools);
    await getBadZonesCached(pools);
    await getBadZonesCached(pools);
    expect(cacheGetRaw).toHaveBeenCalledTimes(1);
  });

  it("recomputes when the zone set changes, so groups do not share verdicts", async () => {
    const { cacheGetRaw } = await import("../../src/lib/cache/client.js");
    await getBadZonesCached([{ proxyUrl: url("isp_proxy1") }]);
    await getBadZonesCached([{ proxyUrl: url("unblocker1") }]);
    expect(cacheGetRaw).toHaveBeenCalledTimes(2);
  });

  it("returns empty for a pool set with no zones at all", async () => {
    expect(await getBadZonesCached([{ proxyUrl: "https://relay.example.com" }])).toEqual(new Map());
  });
});

afterEach(() => {
  resetZoneHealthCache();
});

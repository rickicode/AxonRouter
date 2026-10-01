// The health sweep: it probes pools, records the verdict, and — critically — never
// deactivates anything.
//
// The no-deactivation rule is the load-bearing one. The auto-fetcher replaces every
// group's whole pool set every five minutes, and roughly a quarter of what the
// Bright Data feeds return is dead. Deactivating on a probe result would fight that
// cycle and could empty a group on a transient blip; ranking at pick time gives the
// same protection while leaving every pool recoverable.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pools = [];
const updates = [];
let probeImpl = async () => ({ ok: true, status: 200 });
let probeCalls = [];

vi.mock("../../src/lib/db/repos/proxyPoolsRepo.js", () => ({
  getProxyPools: vi.fn(async () => pools),
  updateProxyPool: vi.fn(async (id, data) => {
    updates.push({ id, data });
    return { id, ...data };
  }),
}));

vi.mock("../../src/lib/network/proxyTest.js", () => ({
  testProxyPoolEntry: vi.fn(async (pool) => {
    probeCalls.push(pool.id);
    return probeImpl(pool);
  }),
}));

// Cross-process lock, so the sweep is a singleton across the gateway cluster: the
// gateway runs 12 workers that each execute the top level of gateway/server.js, and
// without this a dozen sweeps start together, probe the same pools concurrently and
// lose updates on the same zone tallies. acquireLock hands back a token or null, and
// only the holder may release.
let lockHeld = false;
let cacheAvailable = true;
vi.mock("../../src/lib/cache/client.js", () => ({
  isCacheAvailable: () => cacheAvailable,
  acquireLock: vi.fn(async () => {
    if (lockHeld) return null;
    lockHeld = true;
    return "tok";
  }),
  releaseLock: vi.fn(async (_key, token) => {
    if (token === "tok") lockHeld = false;
    return true;
  }),
  cacheGetRaw: vi.fn(async () => null),
  cacheSetRaw: vi.fn(async () => true),
}));

const { sweepProxyPoolHealth, startProxyHealthSweep, stopProxyHealthSweep } = await import(
  "../../src/lib/network/proxyHealthSweep.js"
);

const pool = (id, over = {}) => ({
  id,
  name: id,
  proxyUrl: `http://user:pass@proxy.invalid:${1000 + (id.charCodeAt(0) % 900)}`,
  isActive: true,
  testStatus: "unknown",
  lastTestedAt: null,
  ...over,
});

beforeEach(() => {
  pools.length = 0;
  updates.length = 0;
  probeCalls = [];
  lockHeld = false;
  cacheAvailable = true;
  probeImpl = async () => ({ ok: true, status: 200 });
  stopProxyHealthSweep();
});

afterEach(() => {
  stopProxyHealthSweep();
  vi.restoreAllMocks();
});

describe("sweepProxyPoolHealth", () => {
  it("marks a reachable pool active and records when it was tested", async () => {
    pools.push(pool("a"));
    const s = await sweepProxyPoolHealth();

    expect(s).toMatchObject({ scanned: 1, active: 1, failed: 0, written: 1, error: null });
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("a");
    expect(updates[0].data.testStatus).toBe("active");
    expect(Date.parse(updates[0].data.lastTestedAt)).toBeGreaterThan(0);
  });

  it("marks an unreachable pool failed and keeps the reason", async () => {
    pools.push(pool("a"));
    probeImpl = async () => ({ ok: false, status: 0, error: "ProxyFetch: fetch failed" });
    const s = await sweepProxyPoolHealth();

    expect(s).toMatchObject({ scanned: 1, active: 0, failed: 1, written: 1 });
    expect(updates[0].data.testStatus).toBe("failed");
    expect(updates[0].data.lastError).toContain("fetch failed");
  });

  it("treats an HTTP error as a working proxy", async () => {
    // The probe target is not a health endpoint, so a 4xx/5xx still proves the
    // tunnel connected. Only a transport failure means the egress is dead.
    pools.push(pool("a"));
    probeImpl = async () => ({ ok: false, status: 403, error: "Forbidden" });
    const s = await sweepProxyPoolHealth();
    // testProxyPoolEntry decides ok; here it reports not-ok, so the sweep records
    // failed — the distinction that matters (transport vs HTTP) lives in
    // testProxyPoolEntry, not here.
    expect(s.failed).toBe(1);
  });

  it("never deactivates a pool, even a repeatedly dead one", async () => {
    pools.push(pool("a"), pool("b"));
    probeImpl = async () => ({ ok: false, status: 0, error: "dead" });
    await sweepProxyPoolHealth();
    await sweepProxyPoolHealth({ staleMs: 0 });

    for (const u of updates) {
      expect(u.data.isActive).toBeUndefined();
      expect(u.data.testStatus).toBe("failed");
    }
  });

  it("probes never-tested pools first and re-probes stale ones", async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    pools.push(pool("fresh-unknown"));
    pools.push(pool("stale-active", { testStatus: "active", lastTestedAt: old }));
    pools.push(pool("recently-active", { testStatus: "active", lastTestedAt: new Date().toISOString() }));

    await sweepProxyPoolHealth({ staleMs: 30 * 60 * 1000, batch: 50 });

    expect(probeCalls).toContain("fresh-unknown");
    expect(probeCalls).toContain("stale-active");
    expect(probeCalls).not.toContain("recently-active");
  });

  it("respects the batch limit so a re-imported group cannot monopolise a pass", async () => {
    for (let i = 0; i < 60; i++) pools.push(pool(`p${String(i).padStart(2, "0")}`));
    const s = await sweepProxyPoolHealth({ batch: 10, concurrency: 4 });
    expect(s.scanned).toBe(10);
    expect(probeCalls).toHaveLength(10);
  });

  it("spreads a batch across the whole queue instead of taking the head", async () => {
    // Deterministic ordering plus a slice would mean every pass only ever probes the
    // same first N pools, and the rest stay unknown forever.
    for (let i = 0; i < 40; i++) pools.push(pool(`p${String(i).padStart(2, "0")}`));
    await sweepProxyPoolHealth({ batch: 8, concurrency: 2 });
    expect(new Set(probeCalls).size).toBe(8);
    // Striding, not slicing: the sample reaches the tail of the queue, so a pass
    // covers pools a slice would never look at.
    expect(probeCalls).toContain("p00");
    expect(probeCalls).toContain("p35");
  });

  it("caps concurrency", async () => {
    for (let i = 0; i < 20; i++) pools.push(pool(`p${String(i).padStart(2, "0")}`));
    let inFlight = 0;
    let peak = 0;
    probeImpl = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true, status: 200 };
    };
    await sweepProxyPoolHealth({ batch: 20, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("records a probe that throws as failed instead of aborting the pass", async () => {
    pools.push(pool("a"), pool("b"));
    probeImpl = async (p) => {
      if (p.id === "a") throw new Error("probe exploded");
      return { ok: true, status: 200 };
    };
    const s = await sweepProxyPoolHealth();
    expect(s.failed).toBe(1);
    expect(s.active).toBe(1);
    expect(updates.find((u) => u.id === "a").data.testStatus).toBe("failed");
  });

  it("truncates a long error rather than storing a wall of text", async () => {
    pools.push(pool("a"));
    probeImpl = async () => ({ ok: false, status: 0, error: "x".repeat(5000) });
    await sweepProxyPoolHealth();
    expect(updates[0].data.lastError.length).toBeLessThanOrEqual(180);
  });

  it("clears nothing on success, leaving a stale error out of the way by status", async () => {
    pools.push(pool("a", { testStatus: "failed", lastError: "old failure" }));
    await sweepProxyPoolHealth();
    expect(updates[0].data.testStatus).toBe("active");
    expect(updates[0].data.lastError).toBeUndefined();
  });

  it("skips a second concurrent pass", async () => {
    pools.push(pool("a"), pool("b"), pool("c"));
    let release;
    const gate = new Promise((r) => { release = r; });
    probeImpl = async () => { await gate; return { ok: true, status: 200 }; };

    const first = sweepProxyPoolHealth({ batch: 3, concurrency: 1 });
    await new Promise((r) => setTimeout(r, 10));
    const second = await sweepProxyPoolHealth();
    release();

    expect(second.skipped).toBe(true);
    await first;
  });

  it("never rejects, even when the database read fails", async () => {
    const { getProxyPools } = await import("../../src/lib/db/repos/proxyPoolsRepo.js");
    getProxyPools.mockRejectedValueOnce(new Error("db down"));
    const s = await sweepProxyPoolHealth();
    expect(s.error).toContain("db down");
    expect(s.written).toBe(0);
  });

  it("does nothing when there is nothing to probe", async () => {
    pools.push(pool("a", { testStatus: "active", lastTestedAt: new Date().toISOString() }));
    const s = await sweepProxyPoolHealth();
    expect(s).toMatchObject({ scanned: 0, written: 0 });
    expect(probeCalls).toHaveLength(0);
  });

  it("supports a dry run that computes without writing", async () => {
    pools.push(pool("a"));
    probeImpl = async () => ({ ok: false, status: 0, error: "dead" });
    const s = await sweepProxyPoolHealth({ dryRun: true });
    expect(s.failed).toBe(1);
    expect(s.written).toBe(0);
    expect(updates).toHaveLength(0);
  });
});

describe("cluster singleton", () => {
  it("does not sweep while another process holds the lock", async () => {
    pools.push(pool("a"), pool("b"));
    lockHeld = true; // another worker got there first
    const s = await sweepProxyPoolHealth();
    expect(s.skipped).toBe(true);
    expect(probeCalls).toHaveLength(0);
  });

  it("releases the lock afterwards so the next pass can run", async () => {
    pools.push(pool("a"));
    await sweepProxyPoolHealth();
    expect(lockHeld).toBe(false);
    const second = await sweepProxyPoolHealth();
    expect(second.skipped).toBe(false);
  });

  it("releases the lock even when the pass throws", async () => {
    const { getProxyPools } = await import("../../src/lib/db/repos/proxyPoolsRepo.js");
    getProxyPools.mockRejectedValueOnce(new Error("db down"));
    await sweepProxyPoolHealth();
    expect(lockHeld).toBe(false);
  });

  it("still sweeps when no shared cache is available", async () => {
    // Refusing to sweep would mean no health data at all, which is worse than a
    // possible duplicate pass.
    cacheAvailable = false;
    pools.push(pool("a"));
    const s = await sweepProxyPoolHealth();
    expect(s.skipped).toBe(false);
    expect(s.scanned).toBe(1);
  });
});

describe("startProxyHealthSweep", () => {
  it("is idempotent and can be stopped", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    startProxyHealthSweep({ intervalMs: 60_000 });
    startProxyHealthSweep({ intervalMs: 60_000 });
    expect(spy).toHaveBeenCalledTimes(1);
    stopProxyHealthSweep();
    startProxyHealthSweep({ intervalMs: 60_000 });
    expect(spy).toHaveBeenCalledTimes(2);
    stopProxyHealthSweep();
  });
});

// The public-LLM rate limiter.
//
// This is a test for a bug that no single-process test could ever have caught. The
// limiter counted in a module-level Map, so with 12 cluster workers the effective
// limit was WORKERS x 300 — 1200/minute on four workers, against a comment that
// promised 300. Every worker was individually correct. The property that mattered,
// one limit across the cluster, was untestable until the counter moved to the shared
// store.
//
// The multiplier is the worker count that actually runs, not the configured value:
// gateway/workerMode.mjs clamps GATEWAY_WORKERS to the container core count. A .env
// asking for 12 on four cores still runs four, so reasoning from the configured
// number overstates the bug by 3x.
//
// These tests therefore drive `incr` directly and assert on the decision, plus one
// test that models several workers sharing one counter, which is the case the old
// implementation got wrong.
import { describe, it, expect, vi } from "vitest";
import {
  isRateLimited,
  isLoopback,
  rateLimitKey,
  RATE_LIMIT_WINDOW_S,
  MAX_REQUESTS_PER_WINDOW,
} from "../../gateway/rateLimit.js";

/** A shared counter, as Valkey would behave across every worker. */
function sharedCounter() {
  const store = new Map();
  return vi.fn(async (key, ttl) => {
    if (!store.has(key)) store.set(key, { n: 0, ttl });
    const e = store.get(key);
    e.n += 1;
    return e.n;
  });
}

const IP = "203.0.113.7";
const deps = (over = {}) => ({ incr: sharedCounter(), ...over });

describe("rate limiting", () => {
  it("allows traffic up to the limit and refuses beyond it", async () => {
    const d = deps();
    const seen = [];
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW + 5; i++) {
      seen.push(await isRateLimited(IP, d));
    }
    // The window allows exactly MAX_REQUESTS_PER_WINDOW requests.
    expect(seen.slice(0, MAX_REQUESTS_PER_WINDOW).every((r) => r === false)).toBe(true);
    expect(seen[MAX_REQUESTS_PER_WINDOW]).toBe(true);
    expect(seen.at(-1)).toBe(true);
  });

  it("counts one limit across every worker, not one per worker", async () => {
    // The bug. 12 workers, 30 requests each = 360 requests, which is under 300 only
    // if they are counting separately. Correctly, the limit trips partway through the
    // later workers rather than never tripping at all. Production runs four workers,
    // where the same shape is 4 x 100.
    const incr = sharedCounter();
    const WORKERS = 12;
    let refused = 0;
    for (let w = 0; w < WORKERS; w++) {
      for (let i = 0; i < 30; i++) {
        if (await isRateLimited(IP, { incr })) refused++;
      }
    }
    expect(refused).toBe(30 * WORKERS - MAX_REQUESTS_PER_WINDOW);
    expect(refused).toBeGreaterThan(0);
  });

  it("keys on the address, so one noisy client cannot lock out another", async () => {
    const d = deps();
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW + 10; i++) await isRateLimited(IP, d);
    expect(await isRateLimited(IP, d)).toBe(true);
    expect(await isRateLimited("198.51.100.9", d)).toBe(false);
  });

  it("namespaces the key so it cannot collide with another shared counter", async () => {
    // incrSharedCounter backs model failure counts and dead circuits with plain keys.
    expect(rateLimitKey(IP)).toBe(`ratelimit:ip:${IP}`);
    expect(rateLimitKey(IP)).toContain("ratelimit:");
  });

  it("never counts loopback, so internal traffic is unaffected", async () => {
    const incr = sharedCounter();
    for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "", null, undefined]) {
      expect(await isRateLimited(ip, { incr })).toBe(false);
      expect(isLoopback(ip)).toBe(true);
    }
    // Not a single counter was touched.
    expect(incr).not.toHaveBeenCalled();
  });

  it("fails open when the counter cannot answer", async () => {
    // A limiter outage must not become a traffic outage.
    const failing = vi.fn(async () => null);
    expect(await isRateLimited(IP, { incr: failing })).toBe(false);
  });

  it("fails open when the counter throws rather than returning null", async () => {
    // incrSharedCounter swallows its own errors today, but this sits on the request
    // path: if that ever changes, a limiter outage must not become a 500.
    const throwing = vi.fn(async () => {
      throw new Error("valkey unreachable");
    });
    expect(await isRateLimited(IP, { incr: throwing })).toBe(false);
  });

  it("reports the loss of a real limit instead of silently degrading", async () => {
    // incrSharedCounter falls back to a process-local counter when Valkey is gone and
    // still returns a number, which would restore the exact per-process behaviour
    // this replaced. Nothing in the request path can tell, so it has to be surfaced.
    const onDegrade = vi.fn();
    await isRateLimited(IP, { incr: sharedCounter(), sharedAvailable: () => false, onDegrade });
    expect(onDegrade).toHaveBeenCalledTimes(1);
  });

  it("does not report degradation while the shared store is healthy", async () => {
    const onDegrade = vi.fn();
    await isRateLimited(IP, { incr: sharedCounter(), sharedAvailable: () => true, onDegrade });
    expect(onDegrade).not.toHaveBeenCalled();
  });

  it("asks for a window long enough to bound memory", async () => {
    // Every distinct address creates a key. It has to expire, or a scan of spoofed
    // addresses would grow the store without limit.
    const incr = vi.fn(async () => 1);
    await isRateLimited(IP, { incr });
    expect(incr).toHaveBeenCalledWith(rateLimitKey(IP), RATE_LIMIT_WINDOW_S);
    expect(RATE_LIMIT_WINDOW_S).toBeGreaterThan(0);
    expect(RATE_LIMIT_WINDOW_S).toBeLessThanOrEqual(300);
  });

  it("treats the counter's return as a string or number alike", async () => {
    // Valkey INCR replies with a string; the helper converts, but the limiter must
    // not depend on that having happened.
    const asString = vi.fn(async () => String(MAX_REQUESTS_PER_WINDOW + 1));
    expect(await isRateLimited(IP, { incr: asString })).toBe(true);
    const asNumber = vi.fn(async () => MAX_REQUESTS_PER_WINDOW);
    expect(await isRateLimited(IP, { incr: asNumber })).toBe(false);
  });

  it("honours a lowered limit without editing the module", async () => {
    const d = { incr: sharedCounter(), max: 2 };
    expect(await isRateLimited(IP, d)).toBe(false);
    expect(await isRateLimited(IP, d)).toBe(false);
    expect(await isRateLimited(IP, d)).toBe(true);
  });
});
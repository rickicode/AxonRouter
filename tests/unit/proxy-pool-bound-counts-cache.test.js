// getProxyPoolBoundCounts(): expensive, effectively static, and asked for on every
// proxy-pools page load.
//
// The cost was measured, not assumed: a sequential scan over provider_connections,
// twice, because the scalar and array branches are separate statements inside the
// CTE — 318ms on this deployment. Two partial indexes were added and the planner
// still chose a sequential scan, because it cannot estimate selectivity of a jsonb
// extraction. Rewriting the join from proxy_pools outward produced a nested loop with
// the OR demoted to a join filter: 3.4 million comparisons.
//
// So the fix is a short cache rather than a cleverer query. What matters is that it is
// not observable: same shape out, same values, and an empty result cached rather than
// treated as a miss — the empty case is both the common one and the expensive one.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: vi.fn() }));

import { getAdapter } from "../../src/lib/db/driver.js";

let rows;
let allSpy;

function stubAdapter() {
  // The SQL is db.all's first argument. getAdapter takes none, so the spy that can
  // see the query is the adapter's own.
  allSpy = vi.fn(async () => rows);
  getAdapter.mockResolvedValue({ all: allSpy });
}

async function fresh() {
  // Module state is module state, so each case re-imports to get a clean cache.
  vi.resetModules();
  const mod = await import("../../src/lib/db/repos/connectionsRepo.js");
  return mod.getProxyPoolBoundCounts;
}

describe("getProxyPoolBoundCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [];
    stubAdapter();
  });

  it("returns a count per bound pool", async () => {
    rows = [
      { pool_id: "pool-a", count: 3 },
      { pool_id: "pool-b", count: 1 },
    ];
    const fn = await fresh();
    expect(await fn()).toEqual({ "pool-a": 3, "pool-b": 1 });
  });

  it("returns an empty map when nothing is bound, and caches that", async () => {
    // The empty case is what production actually returns today, and it is the one
    // that cost 318ms per page load. If it were treated as a cache miss it would
    // still be re-scanned every time.
    const fn = await fresh();
    expect(await fn()).toEqual({});
    expect(await fn()).toEqual({});
    const callsAfterFirst = allSpy.mock.calls.length;
    await fn();
    expect(allSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("queries once for repeated calls inside the TTL", async () => {
    rows = [{ pool_id: "pool-a", count: 2 }];
    const fn = await fresh();
    await fn();
    const after = allSpy.mock.calls.length;
    await fn();
    await fn();
    expect(allSpy.mock.calls.length).toBe(after);
  });

  it("coerces a count to a number", async () => {
    // Postgres int8 comes back as a string through some drivers. A count that renders
    // as "3" instead of 3 would be visible in the UI as a string.
    rows = [{ pool_id: "pool-a", count: "7" }];
    const fn = await fresh();
    const out = await fn();
    expect(out["pool-a"]).toBe(7);
    expect(typeof out["pool-a"]).toBe("number");
  });

  it("keeps the placeholder key out of the result", async () => {
    rows = [{ pool_id: null, count: 4 }, { pool_id: "pool-a", count: 1 }];
    const fn = await fresh();
    expect(await fn()).toEqual({ "pool-a": 1 });
  });

  it("does not cache a failed read as an empty result", async () => {
    // Otherwise a transient database error would leave the dashboard showing "0 bound"
    // for a minute after the database came back.
    getAdapter.mockResolvedValue({
      all: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    const fn = await fresh();
    await expect(fn()).rejects.toThrow();
  });

  it("still reads both the scalar and the array form", async () => {
    // The query's whole job is to cover connections that name one pool and
    // connections that name several. A cache in front must not narrow that.
    const fn = await fresh();
    await fn();
    const q = allSpy.mock.calls.at(-1)[0];
    expect(q).toMatch(/proxyPoolId/);
    expect(q).toMatch(/proxyPoolIds/);
    expect(q).toMatch(/jsonb_array_elements_text/);
  });
});
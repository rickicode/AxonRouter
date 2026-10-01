// The in-memory cache behind readable egress labels in the in-flight list.
//
// This exists because there are ~3400 proxy pools alive and the dashboard polls
// every 3s, so reading every pool's name to label a handful of in-flight requests is
// wasted work. The cache was seeded from its own previous contents and only ever
// added to, which combined with the auto-fetcher replacing ~2000 pools with fresh
// uuids every 300s meant the map kept every pool id the process had ever seen.
//
// Nothing reads those entries back: each call only ever asks about the ids currently
// in flight. So the growth was pure leak, invisible to any test that looks at labels,
// since every label the cache returned was correct.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: vi.fn() }));

import { getAdapter } from "../../src/lib/db/driver.js";
import { getProxyPoolLabelMap } from "../../src/lib/db/repos/usageRepo.js";

const POOL_TTL_MS = 30_000;

let poolRows;
let allSpy;

/** Answer the pools query with rows that exist, and nothing for ids that do not. */
function stubAdapter() {
  // The ids reach the query as db.all's parameter, not as an argument to getAdapter,
  // so the spy that matters is the adapter's own.
  allSpy = vi.fn(async (_sql, params) => {
    const ids = params[0];
    return poolRows.filter((r) => ids.includes(r.id));
  });
  getAdapter.mockResolvedValue({ all: allSpy });
}

/** A row for each id, named the way the fetcher names them. */
function givePools(ids) {
  poolRows = ids.map((id) => ({
    id,
    name: `proxy${id.slice(-4)}`,
    proxy_url: `http://${id.slice(-6)}.example:8080`,
    group_name: "proxy100",
  }));
}

describe("getProxyPoolLabelMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolRows = [];
    stubAdapter();
    vi.useRealTimers();
  });

  it("labels a pool as name (group)", async () => {
    givePools(["aaaa1111"]);
    const map = await getProxyPoolLabelMap(["aaaa1111"]);
    expect(map.aaaa1111).toBe("proxy1111 (proxy100)");
  });

  it("returns only the ids asked for, not everything it has ever seen", async () => {
    // The core of the fix. Asking about one id must not hand back the whole history.
    givePools(["aaaa1111"]);
    await getProxyPoolLabelMap(["aaaa1111"]);
    givePools(["bbbb2222"]);
    const map = await getProxyPoolLabelMap(["bbbb2222"]);
    expect(Object.keys(map)).toEqual(["bbbb2222"]);
  });

  it("does not retain ids that have gone away", async () => {
    // Walk the churn the fetcher actually causes: a fresh uuid set each cycle, and
    // the previous set deleted. The retained size has to track the current set, not
    // the number of cycles.
    for (let cycle = 0; cycle < 12; cycle++) {
      const ids = Array.from({ length: 50 }, (_, i) => `cycle${cycle}pool${String(i).padStart(3, "0")}`);
      givePools(ids);
      const map = await getProxyPoolLabelMap(ids);
      expect(Object.keys(map)).toHaveLength(50);
    }
    // A final single-id call is the cheapest way to observe what is still resident.
    givePools(["finalpool"]);
    const after = await getProxyPoolLabelMap(["finalpool"]);
    expect(Object.keys(after)).toEqual(["finalpool"]);
  });

  it("reuses a cached label inside the TTL", async () => {
    givePools(["aaaa1111"]);
    await getProxyPoolLabelMap(["aaaa1111"]);
    const before = allSpy.mock.calls.length;
    await getProxyPoolLabelMap(["aaaa1111"]);
    expect(allSpy.mock.calls.length).toBe(before);
  });

  it("re-reads after the TTL, because a pool can be renamed", async () => {
    const id = "ttlpool";
    givePools([id]);
    await getProxyPoolLabelMap([id]);
    const before = allSpy.mock.calls.length;

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + POOL_TTL_MS + 1);
    poolRows = [{ id, name: "renamed", proxy_url: "http://x:1", group_name: "g" }];
    const map = await getProxyPoolLabelMap([id]);
    vi.useRealTimers();

    expect(map[id]).toBe("renamed (g)");
    expect(allSpy.mock.calls.length).toBeGreaterThan(before);
  });

  it("marks an unknown id as looked-up rather than querying it every poll", async () => {
    // A pool id that has already been deleted still reaches the caller when the
    // auto-fetcher has churned it away mid-request. Negative caching keeps that from
    // becoming a query per poll per row.
    await getProxyPoolLabelMap(["ghost"]);
    const before = allSpy.mock.calls.length;
    await getProxyPoolLabelMap(["ghost"]);
    expect(allSpy.mock.calls.length).toBe(before);
  });

  it("does not cache a failure as a permanent miss", async () => {
    // If the pool table is unreachable, the ids stay uncached so the next poll retries.
    // Negative caching here would hide a recovered database until the TTL expired.
    const id = "recoverpool";
    getAdapter.mockResolvedValue({
      all: async () => {
        throw new Error("pool table unavailable");
      },
    });
    await getProxyPoolLabelMap([id]);
    const before = allSpy.mock.calls.length;

    stubAdapter();
    givePools([id]);
    const map = await getProxyPoolLabelMap([id]);

    expect(allSpy.mock.calls.length).toBeGreaterThan(before);
    expect(map[id]).toBe(`proxy${id.slice(-4)} (proxy100)`);
  });

  it("returns nothing for an empty request instead of the whole cache", async () => {
    givePools(["aaaa1111"]);
    await getProxyPoolLabelMap(["aaaa1111"]);
    expect(await getProxyPoolLabelMap([])).toEqual({});
    expect(await getProxyPoolLabelMap(null)).toEqual({});
  });

  it("falls back to the host when a pool has no name, and to the id when neither parses", async () => {
    // A nameless pool is still worth showing; the host is the part an operator
    // recognises. When even that is unparseable the id prefix is all that is left,
    // and it is better than an empty cell.
    poolRows = [
      { id: "named", name: "", proxy_url: "http://pool.host.example:8080", group_name: "g" },
      { id: "unnamed", name: "", proxy_url: "not a url", group_name: "" },
    ];
    const map = await getProxyPoolLabelMap(["named", "unnamed"]);
    expect(map.named).toBe("pool.host.example:8080 (g)");
    expect(map.unnamed).toBe("unnamed");
  });

  it("deduplicates repeated ids within one call", async () => {
    const id = "deduppool";
    givePools([id]);
    await getProxyPoolLabelMap([id, id, id]);
    const args = allSpy.mock.calls.at(-1)[1][0];
    expect(args).toEqual([id]);
  });
});
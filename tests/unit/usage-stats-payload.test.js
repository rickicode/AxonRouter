// /api/usage/stats ships byAccount only when asked for it.
//
// byAccount was 352KB of the 431KB response (82%) and exactly one table reads it
// — the Accounts tab of UsageStats. The App page consumes this same endpoint and
// never touches it, and UsageStats refetches on the 60s bucket poll, so every
// consumer was paying ~350KB of JSON.parse per refresh for rows almost nobody
// looks at. The tab now asks for them with `?include=byAccount` on first open.
//
// What must NOT regress: every other aggregate, the live fields the SSE client
// merges, and `pending.byAccount` — the in-flight markers are 32 bytes and the
// tab needs them to paint pending counts while the rows are still loading.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/usageDb", () => ({
  getUsageStats: vi.fn(async () => ({
    totalRequests: 42,
    totalCost: 1.5,
    byAccount: { "m|prov|conn1": { requests: 7, accountName: "a@b.c" } },
    byModel: { "some-model": { requests: 42 } },
    byProvider: { prov: { requests: 42 } },
    pending: { byAccount: { conn1: { "some-model": 3 } }, byModel: {} },
  })),
  getActiveRequests: vi.fn(async () => ({
    activeRequests: [{ model: "m", connectionId: "conn1" }],
    recentRequests: [{ model: "m" }],
    errorProvider: "someprov",
  })),
}));

const loadRoute = async () => {
  vi.resetModules();
  return await import("../../src/app/api/usage/stats/route.js");
};

const call = async (query) => {
  const { GET } = await loadRoute();
  return GET(new Request(`http://localhost/api/usage/stats${query}`));
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usage stats payload", () => {
  it("omits byAccount by default", async () => {
    const res = await call("?period=7d");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byAccount).toBeUndefined();
  });

  it("keeps every other aggregate when byAccount is stripped", async () => {
    const body = await (await call("?period=7d")).json();
    expect(body.totalRequests).toBe(42);
    expect(body.totalCost).toBe(1.5);
    expect(body.byModel).toEqual({ "some-model": { requests: 42 } });
    expect(body.byProvider).toEqual({ prov: { requests: 42 } });
  });

  it("still carries pending.byAccount — the live markers the tab paints on", async () => {
    const body = await (await call("?period=7d")).json();
    expect(body.pending.byAccount).toEqual({ conn1: { "some-model": 3 } });
  });

  it("returns byAccount when explicitly requested", async () => {
    const body = await (await call("?period=7d&include=byAccount")).json();
    expect(body.byAccount).toEqual({
      "m|prov|conn1": { requests: 7, accountName: "a@b.c" },
    });
  });

  it("ignores an unknown include token rather than failing the request", async () => {
    const res = await call("?period=7d&include=bogus");
    expect(res.status).toBe(200);
    expect((await res.json()).byAccount).toBeUndefined();
  });

  it("still exposes the live fields the SSE client merges", async () => {
    const body = await (await call("?period=all")).json();
    expect(body.activeRequests).toHaveLength(1);
    expect(body.recentRequests).toHaveLength(1);
    expect(body.errorProvider).toBe("someprov");
  });

  it("rejects an invalid period with 400", async () => {
    const res = await call("?period=1d");
    expect(res.status).toBe(400);
  });
});

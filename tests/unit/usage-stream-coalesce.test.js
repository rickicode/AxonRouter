import { describe, it, expect, vi, beforeEach } from "vitest";

const NOW = { t: 1_000_000 };

vi.mock("@/lib/usageDb", () => ({
  getUsageStats: vi.fn(async () => ({ scans: 1, t: NOW.t })),
  statsEmitter: { on: vi.fn(), off: vi.fn() },
  getActiveRequests: vi.fn(async () => ({ activeRequests: [], recentRequests: [], errorProvider: null })),
  getLast10Minutes: vi.fn(async () => []),
}));

const loadRoute = async () => {
  vi.resetModules();
  const mod = await import("../../src/app/api/usage/stream/route.js");
  return mod;
};

// Drive the internal SSE stream without a real HTTP layer: invoke GET's
// ReadableStream start() with a fake controller, then emit events.
async function openStream(mod, emit) {
  const res = await mod.GET();
  const controller = { enqueue: vi.fn(), close: vi.fn() };
  // ReadableStream internals are opaque; re-drive via statsEmitter handlers.
  // GET registers handlers on statsEmitter.on("update"|"pending") — capture them.
  const handlers = {};
  const { statsEmitter } = await import("@/lib/usageDb");
  statsEmitter.on.mock.calls.forEach(([ev, fn]) => { handlers[ev] = fn; });
  return { res, handlers, enqueue: controller };
}

describe("usage stream shared recalc coalescing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__usageStreamShared = { recalcTimer: null, recalcInFlight: null, lastRecalcAt: 0, lastStats: null };
  });

  it("coalesces rapid update events into one shared getUsageStats scan", async () => {
    const mod = await loadRoute();
    const { statsEmitter, getUsageStats } = await import("@/lib/usageDb");
    await openStream(mod);
    const update = statsEmitter.on.mock.calls.find(([ev]) => ev === "update")?.[1];
    expect(update).toBeTruthy();

    // Fire 10 rapid update events (as a busy gateway would)
    for (let i = 0; i < 10; i++) update();
    await new Promise((r) => setTimeout(r, 20));

    // Without coalescing this would be 10 scans; shared recalc caps it.
    expect(getUsageStats.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("recalcs again after the min-gap elapses", async () => {
    const mod = await loadRoute();
    const { statsEmitter, getUsageStats } = await import("@/lib/usageDb");
    await openStream(mod);
    const update = statsEmitter.on.mock.calls.find(([ev]) => ev === "update")?.[1];

    update();
    await new Promise((r) => setTimeout(r, 20));
    const first = getUsageStats.mock.calls.length;
    expect(first).toBeGreaterThanOrEqual(1);

    // Simulate 6s elapsed (min gap 5s)
    const shared = globalThis.__usageStreamShared;
    shared.lastRecalcAt = Date.now() - 6000;
    update();
    await new Promise((r) => setTimeout(r, 20));
    expect(getUsageStats.mock.calls.length).toBeGreaterThan(first);
  });
});

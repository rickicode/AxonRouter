import { describe, it, expect, vi, beforeEach } from "vitest";

// The gateway runs a cluster and the fitness registry is globalThis-backed, i.e.
// one map per process. Without a broker a pool marked unfit by one worker stayed
// eligible in all the others. These tests pin the Valkey invalidation bus that
// closes that gap: mark -> broadcast -> another worker applies it locally.
const channels = {};
const published = [];

vi.mock("@/lib/cache/valkeyClient.js", () => ({
  getValkey: async () => ({}),
  subscribeValkey: (ch, fn) => { channels[ch] = fn; },
  publishValkey: async (ch, payload) => { published.push({ ch, payload }); },
}));

const {
  markPoolUnfit,
  clearPoolUnfit,
  isPoolFit,
  resetPoolFitness,
} = await import("../../open-sse/services/proxyPoolFitness.js");

const CH = "axon:events:pool-fitness";
const tick = () => new Promise((r) => setTimeout(r, 5));
// Simulate the message arriving in a DIFFERENT worker's subscriber.
function deliverFromPeer(entry) {
  channels[CH]?.(JSON.stringify(entry));
}

describe("pool fitness cross-worker broadcast", () => {
  beforeEach(async () => {
    resetPoolFitness();
    published.length = 0;
    await tick();
  });

  it("broadcasts a mark so peer workers can apply it", async () => {
    markPoolUnfit("pool-A", "tokenharbor::*", Date.now() + 60_000, "region_blocked");
    await tick();
    const sent = published.filter((p) => p.ch === CH);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].payload).toMatchObject({ poolId: "pool-A", scope: "tokenharbor::*", reason: "region_blocked" });
  });

  it("a peer broadcast makes the pool unfit locally", () => {
    // Fresh worker state: nothing is marked yet.
    expect(isPoolFit("pool-A", "tokenharbor::glm-5.3-flash")).toBe(true);

    deliverFromPeer({ poolId: "pool-A", scope: "tokenharbor::*", until: Date.now() + 60_000, reason: "region_blocked" });

    expect(isPoolFit("pool-A", "tokenharbor::glm-5.3-flash")).toBe(false);
    expect(isPoolFit("pool-A", "tokenharbor::deepseek-v4.1-flash:free")).toBe(false);
  });

  it("a peer broadcast does not leak across providers", () => {
    deliverFromPeer({ poolId: "pool-A", scope: "tokenharbor::*", until: Date.now() + 60_000 });
    expect(isPoolFit("pool-A", "opencode::gpt-5.6-luna")).toBe(true);
    expect(isPoolFit("pool-B", "tokenharbor::gpt-5.6-luna")).toBe(true);
  });

  it("an expired peer broadcast does not mark anything", () => {
    deliverFromPeer({ poolId: "pool-A", scope: "tokenharbor::*", until: Date.now() - 1000 });
    expect(isPoolFit("pool-A", "tokenharbor::glm-5.3-flash")).toBe(true);
  });

  it("broadcasts a clear so a manual un-mark reaches the workers", async () => {
    clearPoolUnfit("pool-A", "tokenharbor::*");
    await tick();
    const clears = published.filter((p) => p.ch === CH && p.payload.clear === true);
    expect(clears.length).toBeGreaterThan(0);
    expect(clears[0].payload).toMatchObject({ poolId: "pool-A", clear: true });
  });

  it("a peer clear drops the mark locally", () => {
    deliverFromPeer({ poolId: "pool-A", scope: "tokenharbor::*", until: Date.now() + 60_000 });
    expect(isPoolFit("pool-A", "tokenharbor::glm-5.3-flash")).toBe(false);

    deliverFromPeer({ poolId: "pool-A", scope: "tokenharbor::*", clear: true });
    expect(isPoolFit("pool-A", "tokenharbor::glm-5.3-flash")).toBe(true);
  });

  it("the wildcard clear wipes everything a peer holds", () => {
    deliverFromPeer({ poolId: "pool-A", scope: "tokenharbor::*", until: Date.now() + 60_000 });
    deliverFromPeer({ poolId: "pool-B", scope: "opencode::*", until: Date.now() + 60_000 });
    deliverFromPeer({ poolId: "*", scope: "*", clear: true });
    expect(isPoolFit("pool-A", "tokenharbor::glm-5.3-flash")).toBe(true);
    expect(isPoolFit("pool-B", "opencode::gpt-5.6-luna")).toBe(true);
  });

  it("a malformed broadcast is ignored rather than throwing", () => {
    expect(() => channels[CH]?.("{not json")).not.toThrow();
    expect(() => channels[CH]?.(JSON.stringify({ nope: true }))).not.toThrow();
  });
});
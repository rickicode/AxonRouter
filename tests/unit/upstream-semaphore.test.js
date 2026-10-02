/**
 * Upstream concurrency semaphore (open-sse/utils/upstreamSemaphore.js):
 * bounds concurrent upstream dispatches so traffic spikes queue with
 * 503 + retry_after instead of OOM-killing the box.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  acquireUpstreamSlot,
  configureUpstreamSemaphore,
  createUpstreamSlotHolder,
  upstreamSemaphoreStats,
  UpstreamQueueTimeout,
} from "../../open-sse/utils/upstreamSemaphore.js";

describe("upstream semaphore", () => {
  beforeEach(() => {
    configureUpstreamSemaphore({ maxConcurrent: 2 });
  });

  it("grants up to the limit immediately", async () => {
    const a = await acquireUpstreamSlot({ timeoutMs: 50 });
    const b = await acquireUpstreamSlot({ timeoutMs: 50 });
    expect(upstreamSemaphoreStats().active).toBe(2);
    a.release();
    b.release();
    expect(upstreamSemaphoreStats().active).toBe(0);
  });

  it("queues FIFO and grants in order", async () => {
    const a = await acquireUpstreamSlot({ timeoutMs: 500 });
    const b = await acquireUpstreamSlot({ timeoutMs: 500 });
    const order = [];
    const p1 = acquireUpstreamSlot({ timeoutMs: 500 }).then((s) => { order.push("p1"); return s; });
    const p2 = acquireUpstreamSlot({ timeoutMs: 500 }).then((s) => { order.push("p2"); return s; });
    await new Promise((r) => setTimeout(r, 20));
    a.release();
    const s1 = await p1;
    b.release();
    const s2 = await p2;
    expect(order).toEqual(["p1", "p2"]);
    s1.release();
    s2.release();
  });

  it("rejects with UpstreamQueueTimeout after the queue timeout", async () => {
    const a = await acquireUpstreamSlot({ timeoutMs: 500 });
    const b = await acquireUpstreamSlot({ timeoutMs: 500 });
    await expect(acquireUpstreamSlot({ timeoutMs: 30 })).rejects.toBeInstanceOf(UpstreamQueueTimeout);
    // Timed-out waiter left the queue: a fresh release grants nobody pending.
    expect(upstreamSemaphoreStats().queued).toBe(0);
    a.release();
    b.release();
  });

  it("skip bypasses gating (unit-test path)", async () => {
    const a = await acquireUpstreamSlot({ timeoutMs: 10 });
    const b = await acquireUpstreamSlot({ timeoutMs: 10 });
    const c = await acquireUpstreamSlot({ timeoutMs: 10, skip: true });
    expect(c.queuedMs).toBe(0);
    c.release();
    a.release();
    b.release();
    expect(upstreamSemaphoreStats().active).toBe(0);
  });
});

describe("upstream slot holder (per-request lifetime)", () => {
  it("does not leak a slot when the request is released before it acquires one", async () => {
    const before = upstreamSemaphoreStats().active;
    const holder = createUpstreamSlotHolder();

    // Client aborts between controller creation and the acquire.
    holder.release();
    expect(holder.aborted).toBe(true);
    expect(upstreamSemaphoreStats().active).toBe(before);

    // The acquire site now runs: it must not take a slot it can never give back.
    await holder.acquire({ timeoutMs: 50 });
    expect(holder.slot).toBeNull();
    expect(upstreamSemaphoreStats().active).toBe(before);
  });

  it("still frees the slot for the normal path, idempotently", async () => {
    const before = upstreamSemaphoreStats().active;
    const holder = createUpstreamSlotHolder();
    await holder.acquire({ timeoutMs: 50 });
    expect(upstreamSemaphoreStats().active).toBe(before + 1);

    holder.release();
    expect(upstreamSemaphoreStats().active).toBe(before);
    // disconnect/error/complete can all fire for one request.
    holder.release();
    holder.release();
    expect(upstreamSemaphoreStats().active).toBe(before);
  });
});

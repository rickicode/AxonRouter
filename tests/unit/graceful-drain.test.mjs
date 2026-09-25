import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  trackRequest,
  getActiveRequestCount,
  isDraining,
  drainAndShutdown,
} from "../../src/lib/server/gracefulDrain.js";

describe("Graceful Shutdown & Request Drain", () => {
  it("tracks in-flight requests and decrements accurately on release", () => {
    assert.equal(getActiveRequestCount(), 0);
    const release1 = trackRequest();
    const release2 = trackRequest();
    assert.equal(getActiveRequestCount(), 2);

    release1();
    assert.equal(getActiveRequestCount(), 1);
    release2();
    assert.equal(getActiveRequestCount(), 0);
  });

  it("handles multiple calls to release idempotently", () => {
    const release = trackRequest();
    assert.equal(getActiveRequestCount(), 1);
    release();
    release();
    assert.equal(getActiveRequestCount(), 0);
  });

  it("waits for in-flight requests to complete during drain", async () => {
    const release = trackRequest();
    assert.equal(getActiveRequestCount(), 1);

    let drained = false;
    const drainPromise = drainAndShutdown(2000).then(() => {
      drained = true;
    });

    assert.equal(isDraining(), true);
    assert.equal(drained, false);

    // Release after a short delay
    setTimeout(() => {
      release();
    }, 50);

    await drainPromise;
    assert.equal(drained, true);
    assert.equal(getActiveRequestCount(), 0);
  });
});

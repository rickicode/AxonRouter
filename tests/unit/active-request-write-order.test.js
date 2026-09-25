import { describe, it, expect } from "vitest";
import { trackPendingRequest, getActiveRequests, flushActiveRequestWrites } from "@/lib/db/repos/usageRepo.js";
import { getAdapter } from "@/lib/db/driver.js";

// Regression guard for the ghost active-request race.
//
// `active_requests` INSERT and DELETE used to be fired unawaited at the pool.
// Two unawaited statements for the same request_id could land on different
// pooled connections and resolve out of order, so the DELETE ran first and the
// INSERT reinstated the row. The row then survived until its 120s expiry and
// the dashboard showed phantom active requests / topology edges. The bug was
// invisible while the Valkey registry was healthy because the distributed
// registry shadowed the DB rows; it only surfaced in the fail-open path.
//
// Fix: per-request_id write serialization in `queueActiveRequestWrite`.
describe("Active request DB write ordering (ghost row regression)", () => {
  it("leaves no active_requests row after a start/stop cycle", async () => {
    const db = await getAdapter();

    const rounds = 25;
    for (let i = 0; i < rounds; i++) {
      const connectionId = `conn_ghost_${Date.now()}_${i}`;
      const requestId = `req_ghost_${Date.now()}_${i}`;

      await trackPendingRequest("ghost-model", "anthropic", connectionId, true, false, {
        requestId,
        apiKey: "sk-ghost",
        isStream: false,
      });
      await trackPendingRequest("ghost-model", "anthropic", connectionId, false, false, {
        requestId,
        apiKey: "sk-ghost",
        isStream: false,
      });
      await flushActiveRequestWrites();

      const rows = await db.all("SELECT request_id FROM active_requests WHERE request_id = $1", [requestId]);
      expect(rows.length, `ghost row survived for ${requestId}`).toBe(0);
    }
  });

  it("does not report finished requests through getActiveRequests()", async () => {
    const rounds = 20;
    for (let i = 0; i < rounds; i++) {
      const connectionId = `conn_ghost_vis_${Date.now()}_${i}`;
      const requestId = `req_ghost_vis_${Date.now()}_${i}`;

      await trackPendingRequest("ghost-visible", "anthropic", connectionId, true, false, {
        requestId,
        isStream: false,
      });

      const { activeRequests: duringRun } = await getActiveRequests();
      expect(duringRun.some((r) => r.connectionId === connectionId)).toBe(true);

      await trackPendingRequest("ghost-visible", "anthropic", connectionId, false, false, {
        requestId,
        isStream: false,
      });

      // Allow the serialized queue to drain before asserting.
      await flushActiveRequestWrites();
      const { activeRequests: afterRun } = await getActiveRequests();
      expect(afterRun.some((r) => r.connectionId === connectionId)).toBe(false);
    }
  });
});
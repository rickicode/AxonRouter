import { getUsageStats, statsEmitter, getActiveRequests } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

// Full getUsageStats(period=all) seq-scans the entire month partition
// (~200ms DB + heavy JS aggregation). On busy gateways the "update" event
// fires on every saved request — without coalescing that is one full scan
// per event per open stream (measured 0.6 cores of Postgres CPU on prod).
// Share ONE coalesced recalc across all connected streams: at most one
// scan every STATS_RECALC_MIN_GAP_MS, results broadcast to everyone.
const STATS_RECALC_MIN_GAP_MS = 5000;
const shared = (globalThis.__usageStreamShared ??= {
  recalcTimer: null,
  recalcInFlight: null,
  lastRecalcAt: 0,
  lastStats: null,
});

function scheduleSharedRecalc(onDone) {
  const elapsed = Date.now() - shared.lastRecalcAt;
  const fire = () => {
    if (!shared.recalcInFlight) {
      shared.recalcInFlight = getUsageStats()
        .then((stats) => {
          shared.lastStats = stats;
          shared.lastRecalcAt = Date.now();
        })
        .finally(() => {
          shared.recalcInFlight = null;
        });
    }
    shared.recalcInFlight.then(onDone, onDone);
  };
  if (elapsed >= STATS_RECALC_MIN_GAP_MS) {
    fire();
  } else if (!shared.recalcTimer) {
    shared.recalcTimer = setTimeout(() => {
      shared.recalcTimer = null;
      fire();
    }, STATS_RECALC_MIN_GAP_MS - elapsed);
    shared.recalcTimer.unref?.();
  } else {
    shared.recalcInFlight.then(onDone, onDone);
  }
}

export async function GET() {
  const encoder = new TextEncoder();
  const state = { closed: false, keepalive: null, send: null, sendPending: null, cachedStats: null, hydrated: false };

  // The client merges exactly these five fields over the stats it already holds
  // from the REST fetch (UsageStats.js es.onmessage) and discards everything else
  // in the frame straight after JSON.parse. Sending the whole aggregate anyway
  // measured 431KB per frame at roughly one frame per second on production —
  // 7.76MB in 20s, 379KB/s sustained — to deliver those five fields.
  //
  // The first frame that actually carries an aggregate still sends it whole, so a
  // stream connecting to a warm server hydrates the panel instantly exactly as
  // before; afterwards the aggregate comes from the REST fetch, which re-runs on
  // every period change and on the 60s bucket poll. `pending` and `last10Minutes`
  // stay on every frame — those are what the 60s bucketTick exists to refresh.
  const buildFrame = (base, live) => {
    const frame = {
      activeRequests: live.activeRequests || [],
      recentRequests: live.recentRequests || [],
      errorProvider: live.errorProvider ?? null,
      pending: base?.pending,
      last10Minutes: base?.last10Minutes,
    };
    if (!state.hydrated && base && Object.keys(base).length > 0) {
      state.hydrated = true;
      return { ...base, ...frame };
    }
    return frame;
  };

  const stream = new ReadableStream({
    async start(controller) {
      // Tell EventSource the base reconnect delay (client backoff overrides on repeated failures)
      try {
        controller.enqueue(encoder.encode("retry: 3000\n\n"));
      } catch { /* client already gone */ }
      // Live panel first. Active requests and the recent ring come from Valkey
      // and must not wait on the full usage aggregation, which scans Aiven.
      state.sendPending = async () => {
        if (state.closed) return;
        const base = state.cachedStats || shared.lastStats || {};
        try {
          const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
          const frame = buildFrame(base, { activeRequests, recentRequests, errorProvider });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
        } catch {
          state.closed = true;
          statsEmitter.off("update", state.send);
          statsEmitter.off("pending", state.sendPending);
          clearInterval(state.keepalive);
        }
      };

      // Full stats refresh (heavy) + immediate lightweight push
      state.send = async () => {
        if (state.closed) return;
        try {
          await state.sendPending();
          // Full recalc is shared+coalesced across streams; update cache when done
          scheduleSharedRecalc(async () => {
            if (state.closed) return;
            if (shared.lastStats) {
              state.cachedStats = shared.lastStats;
              try {
                const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
                // cachedStats still takes the fresh aggregate server-side — the
                // bucketTick needs it — it just no longer rides every frame.
                const frame = buildFrame(shared.lastStats, { activeRequests, recentRequests, errorProvider });
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
              } catch {
                state.closed = true;
              }
            }
          });
        } catch {
          state.closed = true;
          statsEmitter.off("update", state.send);
          statsEmitter.off("pending", state.sendPending);
          clearInterval(state.keepalive);
        }
      };

      await state.send();

      statsEmitter.on("update", state.send);
      statsEmitter.on("pending", state.sendPending);

      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          state.closed = true;
          clearInterval(state.keepalive);
        }
      }, 25000);

      // The bucket series advances with wall-clock time, not with traffic, so it
      // must be re-sent even when no request event fires. Without this the stream
      // keeps serving the window captured at connect time.
      state.bucketTick = setInterval(() => {
        if (state.closed || !state.cachedStats) return;
        state.sendPending();
      }, 60000);
    },

    cancel() {
      state.closed = true;
      statsEmitter.off("update", state.send);
      statsEmitter.off("pending", state.sendPending);
      clearInterval(state.keepalive);
      clearInterval(state.bucketTick);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

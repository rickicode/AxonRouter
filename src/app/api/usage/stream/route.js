import { getUsageStats, statsEmitter, getActiveRequests, getLast10Minutes } from "@/lib/usageDb";

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
  const state = { closed: false, keepalive: null, send: null, sendPending: null, cachedStats: null };

  const stream = new ReadableStream({
    async start(controller) {
      // Tell EventSource the base reconnect delay (client backoff overrides on repeated failures)
      try {
        controller.enqueue(encoder.encode("retry: 3000\n\n"));
      } catch { /* client already gone */ }
      // Full stats refresh (heavy) + immediate lightweight push
      state.send = async () => {
        if (state.closed) return;
        try {
          // Push lightweight update immediately so UI reflects changes fast
          if (state.cachedStats || shared.lastStats) {
            state.cachedStats ??= shared.lastStats;
            const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
            const last10Minutes = await getLast10Minutes();
            const quickStats = { ...state.cachedStats, activeRequests, recentRequests, errorProvider, last10Minutes };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(quickStats)}\n\n`));
          }
          // Full recalc is shared+coalesced across streams; update cache when done
          scheduleSharedRecalc(async () => {
            if (state.closed) return;
            if (shared.lastStats) {
              state.cachedStats = shared.lastStats;
              try {
                const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
                const merged = { ...shared.lastStats, activeRequests, recentRequests, errorProvider };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(merged)}\n\n`));
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

      // Lightweight push: only refresh activeRequests + recentRequests on pending changes
      state.sendPending = async () => {
        if (state.closed) return;
        const base = state.cachedStats || shared.lastStats;
        if (!base) return;
        try {
          const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
          const last10Minutes = await getLast10Minutes();
          const stats = { ...base, activeRequests, recentRequests, errorProvider, last10Minutes };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(stats)}\n\n`));
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

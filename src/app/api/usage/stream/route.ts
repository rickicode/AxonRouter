import { getUsageStats, statsEmitter, getActiveRequests } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

type UsageStats = Awaited<ReturnType<typeof getUsageStats>>;
type StreamController = ReadableStreamDefaultController<Uint8Array>;
type StreamHandler = (() => Promise<void>) | null;
type KeepaliveHandle = ReturnType<typeof setInterval> | null;

type StreamState = {
  closed: boolean;
  keepalive: KeepaliveHandle;
  send: StreamHandler;
  sendPending: StreamHandler;
  cachedStats: UsageStats | null;
};

function cleanupState(state: StreamState) {
  state.closed = true;
  if (state.send) {
    statsEmitter.off("update", state.send);
  }
  if (state.sendPending) {
    statsEmitter.off("pending", state.sendPending);
  }
  if (state.keepalive) {
    clearInterval(state.keepalive);
    state.keepalive = null;
  }
}

function enqueueSse(controller: StreamController, encoder: TextEncoder, data: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();
  const state: StreamState = {
    closed: false,
    keepalive: null,
    send: null,
    sendPending: null,
    cachedStats: null,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Full stats refresh (heavy) + immediate lightweight push
      state.send = async () => {
        if (state.closed) return;
        try {
          // Push lightweight update immediately so UI reflects changes fast
          if (state.cachedStats) {
            const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
            const quickStats = { ...state.cachedStats, activeRequests, recentRequests, errorProvider };
            enqueueSse(controller, encoder, quickStats);
          }
          // Then do full recalc and update cache
          const stats = await getUsageStats();
          state.cachedStats = stats;
          enqueueSse(controller, encoder, stats);
        } catch {
          cleanupState(state);
        }
      };

      // Lightweight push: only refresh activeRequests + recentRequests on pending changes
      state.sendPending = async () => {
        if (state.closed || !state.cachedStats) return;
        try {
          const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
          const stats = { ...state.cachedStats, activeRequests, recentRequests, errorProvider };
          enqueueSse(controller, encoder, stats);
        } catch {
          cleanupState(state);
        }
      };

      await state.send();

      statsEmitter.on("update", state.send);
      statsEmitter.on("pending", state.sendPending);

      state.keepalive = setInterval(() => {
        if (state.closed) {
          cleanupState(state);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanupState(state);
        }
      }, 25000);
    },

    cancel() {
      cleanupState(state);
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

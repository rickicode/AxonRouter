import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getConsoleLogs, getConsoleEmitter, initConsoleLogCapture } from "@/lib/consoleLogBuffer";

export const dynamic = "force-dynamic";

initConsoleLogCapture();

function cleanupStream(state, emitter) {
  if (state.closed) return;
  state.closed = true;
  emitter.off("line", state.send);
  emitter.off("clear", state.sendClear);
  clearInterval(state.keepalive);
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const encoder = new TextEncoder();
  const emitter = getConsoleEmitter();
  const state = { closed: false, send: null, sendClear: null, keepalive: null };

  const stream = new ReadableStream({
    start(controller) {
      // Send all buffered logs immediately on connect.
      const buffered = getConsoleLogs();
      if (buffered.length > 0) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "init", logs: buffered })}\n\n`));
      }

      // Next.js does not reliably call cancel() on disconnect, so use the
      // request abort signal as the primary cleanup path.
      request?.signal?.addEventListener("abort", () => cleanupStream(state, emitter), { once: true });

      state.send = (line) => {
        if (state.closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "line", line })}\n\n`));
        } catch {
          cleanupStream(state, emitter);
        }
      };

      state.sendClear = () => {
        if (state.closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "clear" })}\n\n`));
        } catch {
          cleanupStream(state, emitter);
        }
      };

      emitter.on("line", state.send);
      emitter.on("clear", state.sendClear);

      state.keepalive = setInterval(() => {
        if (state.closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanupStream(state, emitter);
        }
      }, 25000);
    },

    cancel() {
      cleanupStream(state, emitter);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

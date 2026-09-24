// Stream handler with disconnect detection - shared for all providers
import { STREAM_STALL_TIMEOUT_MS } from "../config/runtimeConfig.js";
import { dbg } from "./debugLog.js";

// Get HH:MM:SS timestamp
function getTimeString() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Create stream controller with abort and disconnect detection
 * @param {object} options
 * @param {function} options.onDisconnect - Callback when client disconnects
 * @param {object} options.log - Logger instance
 * @param {string} options.provider - Provider name
 * @param {string} options.model - Model name
 */
export function createStreamController({ onDisconnect, onError, log, provider, model, reqTag = "" } = {}) {
  const abortController = new AbortController();
  const startTime = Date.now();
  let disconnected = false;
  let abortTimeout = null;

  // Only abnormal terminations are logged; normal completion is covered by "📊 done".
  // isError uses errorLine (always shown, ignores LOG_LEVEL) so failures survive quiet levels.
  const logStream = (symbol, status, isError = false) => {
    const duration = Date.now() - startTime;
    const emit = isError ? log?.errorLine : log?.line;
    if (emit) emit(reqTag, symbol, `${status} · ${provider}/${model} · ${duration}ms`);
    else console.log(`[${getTimeString()}] ${symbol} ${provider}/${model} · ${status} · ${duration}ms`);
  };

  return {
    signal: abortController.signal,
    startTime,

    isConnected: () => !disconnected,

    // Call when client disconnects
    handleDisconnect: (reason = "client_closed") => {
      if (disconnected) return;
      disconnected = true;

      // Debug-only: Responses API has no [DONE] sentinel, so codex/droid close the
      // socket on every completed request. "📊 done" is the authoritative outcome line.
      dbg("CTRL", `${provider}/${model} | disconnect=${reason} | dur=${Date.now() - startTime}ms`);

      // Delay abort to allow cleanup
      abortTimeout = setTimeout(() => {
        abortController.abort();
      }, 500);

      onDisconnect?.({ reason, duration: Date.now() - startTime });
    },

    // Call when stream completes normally (no line here — "📊 done" is authoritative)
    handleComplete: () => {
      if (disconnected) return;
      disconnected = true;

      if (abortTimeout) {
        clearTimeout(abortTimeout);
        abortTimeout = null;
      }
    },

    // Call on error
    handleError: (error) => {
      if (disconnected) return;
      disconnected = true;

      if (abortTimeout) {
        clearTimeout(abortTimeout);
        abortTimeout = null;
      }

      if (error.name === "AbortError") {
        logStream("⚡", "ABORTED");
        return;
      }

      logStream("✗", `ERROR: ${error.message}`, true);
      onError?.(error);
    },

    abort: () => abortController.abort()
  };
}

/**
 * Create transform stream with disconnect detection
 * Wraps existing transform stream and adds abort capability.
 *
 * Stall detection lives in pipeWithDisconnect (tied to upstream byte
 * activity), not here — output of the transform stream may be silent
 * for long periods while raw bytes still flow (e.g. Kiro EventStream
 * binary frames buffering, Claude reasoning streams).
 *
 * @param {function} [onAbortTerminal] - Receives a human-readable abort
 * message and returns terminal SSE bytes to emit downstream.
 */
export function createDisconnectAwareStream(transformStream, streamController, onAbortTerminal = null) {
  const reader = transformStream.readable.getReader();
  const writer = transformStream.writable.getWriter();
  let terminalEmitted = false;

  // Emit a synthesized terminal payload (e.g. Responses response.failed + [DONE]) once
  const emitTerminal = (controller) => {
    if (terminalEmitted || !onAbortTerminal) return;
    terminalEmitted = true;
    try {
      const bytes = onAbortTerminal();
      if (bytes) controller.enqueue(bytes);
    } catch { /* best-effort terminal */ }
  };

  return new ReadableStream({
    async pull(controller) {
      if (!streamController.isConnected()) {
        emitTerminal(controller);
        controller.close();
        return;
      }

      try {
        const { done, value } = await reader.read();

        if (done) {
          streamController.handleComplete();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        const wasConnected = streamController.isConnected();
        // Controller already closed = downstream ended; not an upstream error, skip noisy log.
        const msg0 = error?.message || "";
        const isControllerClosed = msg0.includes("already closed") || msg0.includes("Invalid state");
        if (!isControllerClosed) streamController.handleError(error);
        reader.cancel().catch(() => {});
        writer.abort().catch(() => {});

        // Treat network resets / socket hang up / abort as graceful close
        const msg = error?.message || "";
        const code = error?.code || error?.cause?.code || "";
        const isNetworkClose =
          error.name === "AbortError" ||
          msg.includes("aborted") ||
          msg.includes("socket hang up") ||
          msg.includes("ECONNRESET") ||
          msg.includes("ETIMEDOUT") ||
          msg.includes("EPIPE") ||
          code === "ECONNRESET" ||
          code === "ETIMEDOUT" ||
          code === "EPIPE" ||
          code === "UND_ERR_SOCKET";

        // Graceful close on network/abort, or when a structured terminal is available
        // (Responses passthrough prefers response.failed + [DONE] over a raw transport error)
        try {
          if (!wasConnected || isNetworkClose || onAbortTerminal) {
            emitTerminal(controller);
            controller.close();
          } else {
            controller.error(error);
          }
        } catch (e) { /* already closed or cancelled */ }
      }
    },

    cancel(reason) {
      streamController.handleDisconnect(reason || "cancelled");
      reader.cancel();
      writer.abort();
    }
  });
}

/**
 * Pipe provider response through transform with disconnect detection.
 *
 * Stall watchdog tracks raw upstream byte activity, not transform output.
 * Reasoning models (Claude thinking via Kiro, etc.) can produce zero SSE
 * output for long stretches while partial EventStream frames keep arriving.
 * Measuring stall on the transform output caused false stalls and the
 * "failed to pipe response" error in Next.
 *
 * Any upstream chunk resets the timer. If no bytes arrive for
 * STREAM_STALL_TIMEOUT_MS, abort the underlying fetch via the controller.
 *
 * @param {Response} providerResponse - Response from provider
 * @param {TransformStream} transformStream - Transform stream for SSE
 * @param {object} streamController - Stream controller from createStreamController
 */
export function pipeWithDisconnect(providerResponse, transformStream, streamController, onAbortTerminal = null, stallTimeoutMs = STREAM_STALL_TIMEOUT_MS) {
  let stallTimer = null;
  let chunkCount = 0;
  let totalBytes = 0;
  let lastChunkAt = Date.now();
  let abortMessage = "upstream connection lost";
  const t0 = Date.now();
  const tag = "STREAM";
  const clearStall = () => {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  };
  const armStall = () => {
    clearStall();
    stallTimer = setTimeout(() => {
      stallTimer = null;
      abortMessage = "stream stall timeout";
      dbg(tag, `STALL TIMEOUT ${stallTimeoutMs}ms | chunks=${chunkCount} | bytes=${totalBytes} | sinceLast=${Date.now() - lastChunkAt}ms`);
      streamController.handleError?.(new Error("stream stall timeout"));
      streamController.abort?.();
    }, stallTimeoutMs);
  };

  // Wrap controller so every termination path clears the stall timer.
  // Without this, abort/cancel/downstream-error paths leave the timer armed
  // and a stale abort could fire after the request has already ended.
  const wrappedController = {
    signal: streamController.signal,
    startTime: streamController.startTime,
    isConnected: () => streamController.isConnected(),
    handleComplete: () => { clearStall(); streamController.handleComplete(); },
    handleError: (e) => { clearStall(); streamController.handleError(e); },
    handleDisconnect: (r) => { clearStall(); streamController.handleDisconnect(r); },
    abort: () => { clearStall(); streamController.abort(); }
  };

  armStall();

  const upstreamTap = new TransformStream({
    transform(chunk, controller) {
      armStall();
      controller.enqueue(chunk);
    },
    flush() { clearStall(); }
  });

  const transformedBody = providerResponse.body
    .pipeThrough(upstreamTap)
    .pipeThrough(transformStream);

  return createDisconnectAwareStream(
    { readable: transformedBody, writable: { getWriter: () => ({ abort: () => Promise.resolve() }) } },
    wrappedController,
    onAbortTerminal ? () => onAbortTerminal(abortMessage) : null
  );
}

/**
 * Peek at the first chunk of a transformed SSE stream before committing it as
 * successful. Returns { stream } to continue (original stream untouched when
 * inconclusive, rebuilt with the head chunk replayed when data arrived), or
 * { failed, error } when the stream died with zero bytes / errored / carried
 * non-SSE garbage — the caller should fail over instead of hanging the client.
 * Never throws; timeout and whitespace-only keepalives are inconclusive
 * (fail-open: commit as today).
 */
export async function peekStreamHead(stream, timeoutMs) {
  const fail = (error) => ({ failed: true, error });
  let reader = null;
  try {
    reader = stream.getReader();
  } catch (e) {
    return fail(e);
  }
  let timer = null;
  try {
    const headRead = reader.read().then(
      (v) => ({ ...v, timedOut: false }),
      (e) => ({ error: e }),
    );
    const readOutcome = await Promise.race([
      headRead,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), Math.max(1, timeoutMs));
        if (timer.unref) timer.unref();
      }),
    ]);
    clearTimeout(timer);

    // Timeout: inconclusive — fail-open and let the caller commit. releaseLock()
    // THROWS while the raced read() is still pending, so the original stream
    // cannot be returned (new Response() rejects locked bodies — "disturbed or
    // locked"). Keep pumping the locked reader through a fresh stream instead;
    // the still-in-flight chunk replays as soon as it lands, so no bytes are lost.
    if (readOutcome.timedOut) {
      const rebuilt = new ReadableStream({
        async start(controller) {
          try {
            const r = await headRead;
            if (r.error) { controller.error(r.error); return; }
            if (!r.done && r.value !== undefined) controller.enqueue(r.value);
          } catch (e) { controller.error(e); }
        },
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              try { reader.releaseLock(); } catch {}
            } else {
              controller.enqueue(value);
            }
          } catch (e) {
            controller.error(e);
          }
        },
        async cancel() {
          try { await reader.cancel(); } catch {}
          try { reader.releaseLock(); } catch {}
        },
      });
      return { stream: rebuilt, timedOut: true };
    }
    if (readOutcome.error || readOutcome.done) {
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock(); } catch {}
      return fail(readOutcome.error || new Error("upstream closed stream with zero bytes"));
    }

    const head = readOutcome.value;
    let headText = "";
    try {
      headText = new TextDecoder().decode(head).trim();
    } catch {}
    // Non-SSE garbage (e.g. an error page behind an SSE content-type):
    // fail over instead of piping junk to the client.
    if (headText && !headText.startsWith("data:") && !headText.startsWith("event:")
        && !headText.startsWith(":") && !headText.startsWith("{") && !headText.startsWith("[DONE]")) {
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock(); } catch {}
      return fail(new Error(`upstream first chunk is not SSE: ${headText.slice(0, 120)}`));
    }

    // Rebuild the stream with the head chunk replayed, then keep pumping the
    // still-locked reader. releaseLock happens at natural close below.
    const rebuilt = new ReadableStream({
      start(controller) { controller.enqueue(head); },
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            try { reader.releaseLock(); } catch {}
          } else {
            controller.enqueue(value);
          }
        } catch (e) {
          controller.error(e);
        }
      },
      async cancel() {
        try { await reader.cancel(); } catch {}
        try { reader.releaseLock(); } catch {}
      },
    });
    return { stream: rebuilt };
  } catch (e) {
    if (timer) clearTimeout(timer);
    try { reader?.releaseLock(); } catch {}
    return fail(e);
  }
}


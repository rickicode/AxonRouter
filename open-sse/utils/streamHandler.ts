// Stream handler with disconnect detection - shared for all providers
import { getStreamIdleTimeoutMs, getSseHeartbeatIntervalMs, getStreamReadinessTimeoutMs } from "./abort";

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
export function createStreamController({ onDisconnect, onError, log, provider, model }: any = {}) {
  const abortController = new AbortController();
  const startTime = Date.now();
  let disconnected = false;
  let abortTimeout = null;

  const logStream = (status) => {
    const duration = Date.now() - startTime;
    const p = provider?.toUpperCase() || "UNKNOWN";
    console.log(`[${getTimeString()}] 🌊 [STREAM] ${p} | ${model || "unknown"} | ${duration}ms | ${status}`);
  };

  return {
    signal: abortController.signal,
    startTime,

    isConnected: () => !disconnected,

    // Call when client disconnects
    handleDisconnect: (reason = "client_closed") => {
      if (disconnected) return;
      disconnected = true;

      logStream(`disconnect: ${reason}`);

      // Delay abort to allow cleanup
      abortTimeout = setTimeout(() => {
        abortController.abort();
      }, 500);

      onDisconnect?.({ reason, duration: Date.now() - startTime });
    },

    // Call when stream completes normally
    handleComplete: () => {
      if (disconnected) return;
      disconnected = true;

      logStream("complete");

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
        logStream("aborted");
        if (error.code === "UPSTREAM_TIMEOUT" || error.code === "STREAM_IDLE_TIMEOUT") {
          onError?.(error);
        }
        return;
      }

      logStream(`error: ${error.message}`);
      onError?.(error);
    },

    abort: () => abortController.abort()
  };
}

/**
 * Create transform stream with disconnect detection
 * Wraps existing transform stream and adds abort capability
 */
export function createDisconnectAwareStream(transformStream, streamController, options?: { model?: string }) {
  const reader = transformStream.readable.getReader();
  const writer = transformStream.writable.getWriter();
  const baseIdleTimeoutMs = getStreamIdleTimeoutMs();
  const streamReadinessTimeoutMs = getStreamReadinessTimeoutMs();
  const heartbeatIntervalMs = getSseHeartbeatIntervalMs();
  const modelName = (options?.model || "").toLowerCase();
  const isThinkingModel = modelName.includes("thinking") || modelName.includes("-r1") || modelName.endsWith("/r1");
  const THINKING_FIRST_CHUNK_TIMEOUT_MS = 300_000;
  let firstChunkReceived = false;
  let idleTimer = null;
  let heartbeatTimer = null;
  const encoder = new TextEncoder();

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const clearHeartbeatTimer = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const startHeartbeat = (controller) => {
    clearHeartbeatTimer();
    if (!heartbeatIntervalMs) return;
    heartbeatTimer = setInterval(() => {
      try {
        controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      } catch {}
    }, heartbeatIntervalMs);
  };

  const resetHeartbeat = (controller) => {
    if (!heartbeatIntervalMs) return;
    startHeartbeat(controller);
  };

  const refreshIdleTimer = (controller) => {
    clearIdleTimer();
    let idleTimeoutMs: number;
    if (!firstChunkReceived) {
      idleTimeoutMs = isThinkingModel ? THINKING_FIRST_CHUNK_TIMEOUT_MS : streamReadinessTimeoutMs;
    } else {
      idleTimeoutMs = baseIdleTimeoutMs;
    }
    idleTimer = setTimeout(() => {
      const error: any = new Error(`stream idle timeout after ${idleTimeoutMs}ms`);
      error.name = "AbortError";
      error.code = "STREAM_IDLE_TIMEOUT";
      clearHeartbeatTimer();
      streamController.handleError(error);
      reader.cancel(error).catch(() => {});
      writer.abort(error).catch(() => {});
      try {
        controller.error(error);
      } catch {}
    }, idleTimeoutMs);
  };

  return new ReadableStream({
    start(controller) {
      startHeartbeat(controller);
    },

    async pull(controller) {
      if (!streamController.isConnected()) {
        clearIdleTimer();
        clearHeartbeatTimer();
        controller.close();
        return;
      }

      try {
        refreshIdleTimer(controller);
        const { done, value } = await reader.read();
        clearIdleTimer();
        if (done) {
          clearHeartbeatTimer();
          streamController.handleComplete();
          controller.close();
          return;
        }
        firstChunkReceived = true;
        resetHeartbeat(controller);
        controller.enqueue(value);
      } catch (error) {
        clearIdleTimer();
        clearHeartbeatTimer();
        streamController.handleError(error);
        // Send [DONE] signal before closing on error so clients know the stream ended
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch {}
        // Cleanup reader/writer to avoid orphaned streams
        reader.cancel().catch(() => {});
        writer.abort().catch(() => {});
        controller.error(error);
      }
    },

    cancel(reason) {
      clearIdleTimer();
      clearHeartbeatTimer();
      streamController.handleDisconnect(reason || "cancelled");
      reader.cancel();
      writer.abort();
    }
  });
}

/**
 * Pipe provider response through transform with disconnect detection
 * @param {Response} providerResponse - Response from provider
 * @param {TransformStream} transformStream - Transform stream for SSE
 * @param {object} streamController - Stream controller from createStreamController
 */
export function pipeWithDisconnect(providerResponse, transformStream, streamController, options?: { model?: string }) {
  const transformedBody = providerResponse.body.pipeThrough(transformStream);
  return createDisconnectAwareStream(
    { readable: transformedBody, writable: { getWriter: () => ({ abort: () => Promise.resolve() }) } },
    streamController,
    options
  );
}


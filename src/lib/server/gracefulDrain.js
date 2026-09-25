// In-flight request tracking & graceful shutdown drain manager for AxonRouter.
// Allows ongoing streaming & inference requests to complete cleanly before process terminates.

let activeRequests = 0;
let isShuttingDown = false;
const shutdownListeners = new Set();

/**
 * Increment in-flight request counter.
 * @returns {() => void} Completion callback to decrement counter
 */
export function trackRequest() {
  if (isShuttingDown) {
    throw new Error("Server is shutting down");
  }
  activeRequests += 1;
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    activeRequests = Math.max(0, activeRequests - 1);
    if (isShuttingDown && activeRequests === 0) {
      for (const cb of shutdownListeners) cb();
    }
  };
}

/**
 * Get current in-flight request count.
 * @returns {number}
 */
export function getActiveRequestCount() {
  return activeRequests;
}

/**
 * Check if the server is in draining/shutdown phase.
 * @returns {boolean}
 */
export function isDraining() {
  return isShuttingDown;
}

/**
 * Initiates graceful drain: marks server as shutting down and awaits in-flight requests.
 * @param {number} [timeoutMs=15000] - Max time to wait for requests before forced exit
 * @returns {Promise<void>}
 */
export async function drainAndShutdown(timeoutMs = 15000) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Drain] Shutdown initiated. Waiting for ${activeRequests} in-flight request(s) (timeout: ${timeoutMs}ms)...`);

  if (activeRequests === 0) {
    console.log("[Drain] Zero in-flight requests. Drain complete.");
    return;
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[Drain] Timed out waiting for ${activeRequests} in-flight request(s). Forcing termination.`);
      resolve();
    }, timeoutMs);
    if (timer.unref) timer.unref();

    shutdownListeners.add(() => {
      clearTimeout(timer);
      console.log("[Drain] All in-flight requests settled. Drain complete.");
      resolve();
    });
  });
}

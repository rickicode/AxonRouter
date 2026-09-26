import { incrSharedCounter, delSharedCounter } from "@/lib/cache/client.js";

export const PROXY_FAILOVER_THRESHOLD = 3;
export const PROXY_DEAD_THRESHOLD = 5;
export const PROXY_FAIL_WINDOW_S = 600; // 10 minutes

/**
 * Compute the next test/health state for a proxy pool.
 * - 1..2 failures: degraded (stays active)
 * - 3..4 failures: unhealthy (disabled, transient isolation)
 * - 5+ failures: dead (disabled, persistent failure)
 *
 * @param {object} proxyPool Existing pool record
 * @param {{ ok: boolean, status?: number, error?: string }} testResult
 * @param {number} [threshold=3]
 * @param {number} [deadThreshold=5]
 * @returns {{ testStatus: string, isActive: boolean, consecutiveFailures: number, lastTestedAt: string, lastError: string|null }}
 */
export function computeProxyTestHealth(
  proxyPool,
  testResult,
  threshold = PROXY_FAILOVER_THRESHOLD,
  deadThreshold = PROXY_DEAD_THRESHOLD
) {
  const isOk = Boolean(testResult?.ok);
  const prevFailures = Number(proxyPool?.consecutiveFailures || 0);
  const consecutiveFailures = isOk ? 0 : prevFailures + 1;

  let testStatus;
  if (isOk) {
    testStatus = "active";
  } else if (consecutiveFailures >= deadThreshold || proxyPool?.testStatus === "dead") {
    testStatus = "dead";
  } else if (consecutiveFailures >= threshold) {
    testStatus = "unhealthy";
  } else {
    testStatus = "degraded";
  }

  // Disabled on >= 3 consecutive failures. If test passes, re-enable.
  // On transient failure (< 3), preserve current isActive state.
  const isActive = isOk ? true : (consecutiveFailures >= threshold ? false : (proxyPool?.isActive !== false));

  const now = new Date().toISOString();
  const lastError = isOk
    ? null
    : (testResult?.error || (testResult?.status ? `Proxy test failed with status ${testResult.status}` : "Proxy test failed"));

  return {
    testStatus,
    isActive,
    consecutiveFailures,
    lastTestedAt: now,
    lastError,
  };
}

/**
 * Track runtime proxy failure (e.g. ECONNREFUSED, timeout during chat completion).
 * Increments atomic counter in cache.
 * - >= 3 failures: marks as unhealthy (disabled)
 * - >= 5 failures: marks as dead (disabled permanently)
 *
 * @param {string} poolId
 * @param {Error|string} [error]
 * @param {number} [threshold=3]
 * @param {number} [deadThreshold=5]
 * @returns {Promise<number|null>} New consecutive failure count
 */
export async function recordRuntimeProxyFailure(
  poolId,
  error = null,
  threshold = PROXY_FAILOVER_THRESHOLD,
  deadThreshold = PROXY_DEAD_THRESHOLD
) {
  if (!poolId) return null;
  const counterKey = `proxy:fails:${poolId}`;
  const count = await incrSharedCounter(counterKey, PROXY_FAIL_WINDOW_S);

  if (count != null && count >= threshold) {
    try {
      const { getProxyPoolById, updateProxyPool, invalidateProxyPoolCache } = await import("@/lib/db/repos/proxyPoolsRepo.js");
      const pool = await getProxyPoolById(poolId);
      if (pool) {
        const isDead = count >= deadThreshold;
        const targetStatus = isDead ? "dead" : "unhealthy";
        if (pool.isActive || pool.testStatus !== targetStatus || pool.consecutiveFailures !== count) {
          const errorMsg = (typeof error === "string" ? error : error?.message) || `Proxy connection failed (${count} consecutive errors)`;
          await updateProxyPool(poolId, {
            isActive: false,
            testStatus: targetStatus,
            consecutiveFailures: count,
            lastError: errorMsg,
            lastTestedAt: new Date().toISOString(),
          });
          invalidateProxyPoolCache(poolId);
          console.warn(`[ProxyHealth] Proxy pool ${poolId} ("${pool.name}") marked as ${targetStatus} after ${count} consecutive failures: ${errorMsg}`);
        }
      }
    } catch (err) {
      console.warn(`[ProxyHealth] Failed to update pool status for ${poolId}:`, err.message);
    }
  }

  return count;
}

/**
 * Reset runtime failure counter for a proxy pool upon successful request.
 *
 * @param {string} poolId
 * @returns {Promise<void>}
 */
export async function recordRuntimeProxySuccess(poolId) {
  if (!poolId) return;
  const counterKey = `proxy:fails:${poolId}`;
  await delSharedCounter(counterKey);
}

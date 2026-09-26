import { incrSharedCounter, delSharedCounter } from "@/lib/cache/client.js";

export const PROXY_FAILOVER_THRESHOLD = 3;
export const PROXY_FAIL_WINDOW_S = 600; // 10 minutes

/**
 * Compute the next test/health state for a proxy pool.
 * Marks as unhealthy and disabled if consecutive failures reach threshold (default 3).
 *
 * @param {object} proxyPool Existing pool record
 * @param {{ ok: boolean, status?: number, error?: string }} testResult
 * @param {number} [threshold=3]
 * @returns {{ testStatus: string, isActive: boolean, consecutiveFailures: number, lastTestedAt: string, lastError: string|null }}
 */
export function computeProxyTestHealth(proxyPool, testResult, threshold = PROXY_FAILOVER_THRESHOLD) {
  const isOk = Boolean(testResult?.ok);
  const prevFailures = Number(proxyPool?.consecutiveFailures || 0);
  const consecutiveFailures = isOk ? 0 : prevFailures + 1;
  const isDead = !isOk && consecutiveFailures >= threshold;

  const testStatus = isOk
    ? "active"
    : (isDead ? "unhealthy" : "degraded");

  // Disabled on >= 3 consecutive failures. If test passes, re-enable.
  // On transient failure (< 3), preserve current isActive state.
  const isActive = isOk ? true : (isDead ? false : (proxyPool?.isActive !== false));

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
 * Increments atomic counter in cache. If consecutive failures reach threshold (3),
 * marks the proxy pool as unhealthy and disables it in the database.
 *
 * @param {string} poolId
 * @param {Error|string} [error]
 * @param {number} [threshold=3]
 * @returns {Promise<number|null>} New consecutive failure count
 */
export async function recordRuntimeProxyFailure(poolId, error = null, threshold = PROXY_FAILOVER_THRESHOLD) {
  if (!poolId) return null;
  const counterKey = `proxy:fails:${poolId}`;
  const count = await incrSharedCounter(counterKey, PROXY_FAIL_WINDOW_S);

  if (count != null && count >= threshold) {
    try {
      const { getProxyPoolById, updateProxyPool, invalidateProxyPoolCache } = await import("@/lib/db/repos/proxyPoolsRepo.js");
      const pool = await getProxyPoolById(poolId);
      if (pool && pool.isActive) {
        const errorMsg = (typeof error === "string" ? error : error?.message) || `Proxy connection failed (${count} consecutive errors)`;
        await updateProxyPool(poolId, {
          isActive: false,
          testStatus: "unhealthy",
          consecutiveFailures: count,
          lastError: errorMsg,
          lastTestedAt: new Date().toISOString(),
        });
        invalidateProxyPoolCache(poolId);
        console.warn(`[ProxyHealth] Proxy pool ${poolId} ("${pool.name}") marked as unhealthy/dead after ${count} consecutive failures: ${errorMsg}`);
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

import { getProxyPools, updateProxyPool } from "@/lib/db/repos/proxyPoolsRepo.js";
import { testProxyPoolEntry } from "@/lib/network/proxyTest.js";
import { computeProxyTestHealth } from "@/lib/network/proxyHealth.js";

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between recovery probes
const MAX_CONCURRENT_PROBES = 3;

/**
 * Periodically probes degraded or unhealthy proxy pools.
 * If an unhealthy/degraded pool succeeds, resets its failure counter
 * and re-activates it automatically.
 */
export async function autoRecoverUnhealthyProxyPools({
  minCooldownMs = DEFAULT_COOLDOWN_MS,
  limit = 20,
} = {}) {
  try {
    const pools = await getProxyPools();
    if (!pools || !pools.length) return { checked: 0, recovered: 0, stillFailing: 0, results: [] };

    const now = Date.now();
    const candidates = pools.filter((p) => {
      const isUnhealthy = !p.isActive || p.testStatus === "unhealthy";
      const isDegraded = p.testStatus === "degraded" || Number(p.consecutiveFailures) > 0;
      if (!isUnhealthy && !isDegraded) return false;

      // Respect cooldown so we don't spam probes
      if (p.lastTestedAt) {
        const lastTestedTime = new Date(p.lastTestedAt).getTime();
        if (now - lastTestedTime < minCooldownMs) {
          return false;
        }
      }
      return true;
    }).slice(0, limit);

    if (candidates.length === 0) {
      return { checked: 0, recovered: 0, stillFailing: 0, results: [] };
    }

    const results = [];
    let recovered = 0;
    let stillFailing = 0;

    for (let i = 0; i < candidates.length; i += MAX_CONCURRENT_PROBES) {
      const chunk = candidates.slice(i, i + MAX_CONCURRENT_PROBES);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (pool) => {
          const testResult = await testProxyPoolEntry(pool, 8000);
          if (testResult.ok) {
            const healthUpdate = computeProxyTestHealth(pool, testResult);
            await updateProxyPool(pool.id, healthUpdate);
            console.log(
              `[ProxyAutoRecovery] Pool ${pool.id} ("${pool.name}") recovered successfully and is now active.`
            );
            return { id: pool.id, name: pool.name, recovered: true };
          } else {
            await updateProxyPool(pool.id, {
              lastTestedAt: new Date().toISOString(),
              lastError: testResult.error || "Auto-recovery check failed",
            });
            return { id: pool.id, name: pool.name, recovered: false, error: testResult.error };
          }
        })
      );

      for (const res of chunkResults) {
        if (res.status === "fulfilled") {
          results.push(res.value);
          if (res.value.recovered) recovered++;
          else stillFailing++;
        } else {
          stillFailing++;
        }
      }
    }

    if (recovered > 0) {
      console.log(`[ProxyAutoRecovery] Auto-recovered ${recovered} proxy pool(s)`);
    }

    return {
      checked: candidates.length,
      recovered,
      stillFailing,
      results,
    };
  } catch (err) {
    console.error("[ProxyAutoRecovery] Error during auto-recovery sweep:", err);
    return { checked: 0, recovered: 0, stillFailing: 0, error: err?.message, results: [] };
  }
}

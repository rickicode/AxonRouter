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
  includeDead = false,
} = {}) {
  try {
    const pools = await getProxyPools();
    if (!pools || !pools.length) return { checked: 0, recovered: 0, stillFailing: 0, markedDead: 0, results: [] };

    const now = Date.now();
    const candidates = pools.filter((p) => {
      const isDead = p.testStatus === "dead" || Number(p.consecutiveFailures) >= 5;
      if (isDead && !includeDead) return false;

      const isUnhealthy = !p.isActive || p.testStatus === "unhealthy";
      const isDegraded = p.testStatus === "degraded" || Number(p.consecutiveFailures) > 0;
      if (!isUnhealthy && !isDegraded && !isDead) return false;

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
      return { checked: 0, recovered: 0, stillFailing: 0, markedDead: 0, results: [] };
    }

    const results = [];
    let recovered = 0;
    let stillFailing = 0;
    let markedDead = 0;

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
            return { id: pool.id, name: pool.name, recovered: true, status: "active" };
          } else {
            // Escalate failure count and transition to 'dead' if failures persist
            const healthUpdate = computeProxyTestHealth(pool, testResult);
            await updateProxyPool(pool.id, healthUpdate);
            const isNowDead = healthUpdate.testStatus === "dead";
            if (isNowDead) {
              console.warn(
                `[ProxyAutoRecovery] Pool ${pool.id} ("${pool.name}") failed continuously (${healthUpdate.consecutiveFailures} errors) and is now marked as DEAD.`
              );
            }
            return {
              id: pool.id,
              name: pool.name,
              recovered: false,
              markedDead: isNowDead,
              status: healthUpdate.testStatus,
              consecutiveFailures: healthUpdate.consecutiveFailures,
              error: testResult.error,
            };
          }
        })
      );

      for (const res of chunkResults) {
        if (res.status === "fulfilled") {
          results.push(res.value);
          if (res.value.recovered) {
            recovered++;
          } else {
            stillFailing++;
            if (res.value.markedDead) markedDead++;
          }
        } else {
          stillFailing++;
        }
      }
    }

    if (recovered > 0 || markedDead > 0) {
      console.log(`[ProxyAutoRecovery] Auto-recovery sweep finished: ${recovered} recovered, ${markedDead} marked dead, ${stillFailing} still failing`);
    }

    return {
      checked: candidates.length,
      recovered,
      stillFailing,
      markedDead,
      results,
    };
  } catch (err) {
    console.error("[ProxyAutoRecovery] Error during auto-recovery sweep:", err);
    return { checked: 0, recovered: 0, stillFailing: 0, markedDead: 0, error: err?.message, results: [] };
  }
}

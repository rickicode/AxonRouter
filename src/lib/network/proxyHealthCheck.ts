import { getCurrentProxyPools, updateCurrentProxyPool } from "@/lib/proxyPoolAccess";
import { testProxyUrl, testRelay } from "@/lib/network/proxyTest";

const HEALTH_CHECK_INTERVAL_MS = 1800000; // 30 minutes
const INITIAL_DELAY_MS = 60000; // 60 seconds before first check

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let initialDelayTimer: ReturnType<typeof setTimeout> | null = null;
let lastHealthCheckAt: string | null = null;
let isRunning = false;

export function getLastHealthCheckAt(): string | null {
  return lastHealthCheckAt;
}

export async function runHealthCheckNow(): Promise<{ checkedAt: string; results: any[]; skipped?: boolean; reason?: string }> {
  if (isRunning) {
    return { checkedAt: lastHealthCheckAt || new Date().toISOString(), results: [], skipped: true, reason: "Health check already in progress" };
  }

  isRunning = true;
  const results: any[] = [];

  try {
    const pools = await getCurrentProxyPools();
    const activePools = pools.filter((pool: any) => pool.isActive === true);

    for (const pool of activePools) {
      try {
        const result =
          pool.type === "relay"
            ? await testRelay(pool.proxyUrl)
            : await testProxyUrl({ proxyUrl: pool.proxyUrl });

        const now = new Date().toISOString();
        const updateData = {
          testStatus: result.ok ? "active" : "error",
          lastTestedAt: now,
          lastError: result.ok ? null : result.error || `Health check failed with status ${result.status}`,
          responseTimeMs: result.elapsedMs ?? null,
        };

        await updateCurrentProxyPool(pool.id, updateData);

        results.push({
          id: pool.id,
          name: pool.name,
          testStatus: updateData.testStatus,
          responseTimeMs: updateData.responseTimeMs,
          error: updateData.lastError,
        });
      } catch (err) {
        const error = err as { message?: string };
        const now = new Date().toISOString();
        await updateCurrentProxyPool(pool.id, {
          testStatus: "error",
          lastTestedAt: now,
          lastError: error?.message || "Unknown health check error",
          responseTimeMs: null,
        });

        results.push({
          id: pool.id,
          name: pool.name,
          testStatus: "error",
          responseTimeMs: null,
          error: error?.message || "Unknown health check error",
        });
      }
    }

    lastHealthCheckAt = new Date().toISOString();
  } finally {
    isRunning = false;
  }

  return { checkedAt: lastHealthCheckAt, results };
}

export function startProxyHealthCheck(): void {
  if (healthCheckInterval) return;

  // Run first health check after a short delay to avoid blocking startup
  initialDelayTimer = setTimeout(() => {
    void runHealthCheckNow();
  }, INITIAL_DELAY_MS);

  healthCheckInterval = setInterval(() => {
    void runHealthCheckNow();
  }, HEALTH_CHECK_INTERVAL_MS);
}

export function stopProxyHealthCheck(): void {
  if (initialDelayTimer) {
    clearTimeout(initialDelayTimer);
    initialDelayTimer = null;
  }
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

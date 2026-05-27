const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const appGlobal = (globalThis as any).__appSingleton ??= {};

type SchedulerStatus = {
  running: boolean;
  nextRunAt: number | null;
  lastRun: {
    at: number | null;
    successCount: number;
    errorCount: number;
  };
};

export class UsageCheckScheduler {
  logger: any;
  timerId: ReturnType<typeof setTimeout> | null;
  running: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastSuccessCount: number;
  lastErrorCount: number;

  constructor() {
    this.logger = console;
    this.timerId = null;
    this.running = false;
    this.nextRunAt = null;
    this.lastRunAt = null;
    this.lastSuccessCount = 0;
    this.lastErrorCount = 0;
  }

  getStatus(): SchedulerStatus {
    return {
      running: this.running,
      nextRunAt: this.nextRunAt,
      lastRun: {
        at: this.lastRunAt,
        successCount: this.lastSuccessCount,
        errorCount: this.lastErrorCount,
      },
    };
  }

  async start() {
    if (this.running) return this.getStatus();
    this.running = true;
    this.scheduleNext();
    return this.getStatus();
  }

  stop() {
    this.running = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.nextRunAt = null;
  }

  private scheduleNext() {
    if (!this.running) return;
    this.nextRunAt = Date.now() + SCHEDULER_INTERVAL_MS;
    this.timerId = setTimeout(() => {
      void this.runScheduled();
    }, SCHEDULER_INTERVAL_MS);
    if (this.timerId.unref) this.timerId.unref();
  }

  async runScheduled() {
    if (!this.running) return { skipped: true };

    this.lastRunAt = Date.now();
    let successCount = 0;
    let errorCount = 0;

    try {
      const { getSettings } = await import("@/lib/localDb");
      const settings = await getSettings();
      if (!settings.enableUsageCheckScheduler) {
        this.scheduleNext();
        return { skipped: true, reason: "disabled" };
      }

      const { getAllActiveOAuthConnections } = await import("@/lib/localDb") as any;
      const connections = await getAllActiveOAuthConnections();

      const batchSize = 3;
      for (let i = 0; i < connections.length; i += batchSize) {
        const batch = connections.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (conn) => {
            try {
              const { runDedupedUsageRefreshJob } = await import("@/lib/usageRefreshQueue");
              const { refreshUsageWithTransientSkip } = await import("@/lib/usageRefreshAccess");
              await runDedupedUsageRefreshJob(conn.id, () => refreshUsageWithTransientSkip(conn.id));
            } catch (err) {
              throw err;
            }
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled") successCount++;
          else errorCount++;
        }
      }
    } catch (err) {
      this.logger.error("[UsageCheckScheduler] run error:", err);
      errorCount++;
    }

    this.lastSuccessCount = successCount;
    this.lastErrorCount = errorCount;
    this.scheduleNext();
    return { successCount, errorCount };
  }
}

export function getUsageCheckScheduler(): UsageCheckScheduler {
  if (!appGlobal.usageCheckScheduler) {
    appGlobal.usageCheckScheduler = new UsageCheckScheduler();
  }
  return appGlobal.usageCheckScheduler;
}

import { getCurrentProviderConnections } from "@/lib/connectionAccess";
import { runDedupedUsageRefreshJob } from "@/lib/usageRefreshQueue";
import { refreshUsageWithTransientSkip } from "@/lib/usageRefreshAccess";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";

const appGlobal = ((global as any).__appSingleton ??= {});

const DEFAULT_INTERVAL_MINUTES = 5;

type UsageCheckLastRun = {
  startedAt: string;
  completedAt: string;
  status: string;
  message: string;
  refreshedCount: number;
  errorCount: number;
  totalConnections: number;
};

export class UsageCheckScheduler {
  logger: any;
  timerId: ReturnType<typeof setTimeout> | null;
  running: boolean;
  startedAt: string | null;
  nextRunAt: string | null;
  lastRun: UsageCheckLastRun | null;
  settings: { enabled: boolean; intervalMinutes: number };

  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.timerId = null;
    this.running = false;
    this.startedAt = null;
    this.nextRunAt = null;
    this.lastRun = null;
    this.settings = { enabled: true, intervalMinutes: DEFAULT_INTERVAL_MINUTES };
  }

  async start() {
    this.startedAt = this.startedAt || new Date().toISOString();
    this.scheduleNext();
    this.logger.log?.("[UsageCheck] Scheduler started");
    return this.getStatus();
  }

  scheduleNext() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    const intervalMs = this.settings.intervalMinutes * 60 * 1000;
    this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    this.timerId = setTimeout(() => {
      this.runScheduled().catch((error) => {
        this.logger.error?.("[UsageCheck] Scheduled run failed:", error);
      });
    }, intervalMs);

    if (typeof this.timerId?.unref === "function") {
      this.timerId.unref();
    }
  }

  async runScheduled() {
    if (this.running) {
      this.logger.warn?.("[UsageCheck] Run already active, skipping scheduled tick");
      return this.lastRun;
    }

    this.running = true;
    this.nextRunAt = null;
    const startedAt = new Date().toISOString();

    try {
      const allConnections = await getCurrentProviderConnections({ isActive: true });
      const oauthConnections = (allConnections || []).filter(
        (conn: any) =>
          conn.authType === "oauth" &&
          USAGE_SUPPORTED_PROVIDERS.includes(conn.provider),
      );

      const totalConnections = oauthConnections.length;
      let refreshedCount = 0;
      let errorCount = 0;

      const results = await Promise.allSettled(
        oauthConnections.map((conn: any) =>
          runDedupedUsageRefreshJob(conn.id, () =>
            refreshUsageWithTransientSkip(conn.id),
          ),
        ),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          refreshedCount++;
        } else {
          errorCount++;
        }
      }

      const completedAt = new Date().toISOString();
      const status = errorCount === 0 ? "success" : "partial";
      const message =
        errorCount === 0
          ? `Refreshed ${refreshedCount}/${totalConnections} connections`
          : `Refreshed ${refreshedCount}/${totalConnections}, ${errorCount} errors`;

      this.lastRun = {
        startedAt,
        completedAt,
        status,
        message,
        refreshedCount,
        errorCount,
        totalConnections,
      };

      return this.lastRun;
    } catch (error) {
      const completedAt = new Date().toISOString();
      this.lastRun = {
        startedAt,
        completedAt,
        status: "error",
        message: (error as Error).message || "Unknown error",
        refreshedCount: 0,
        errorCount: 0,
        totalConnections: 0,
      };
      return this.lastRun;
    } finally {
      this.running = false;
      this.scheduleNext();
    }
  }

  stop() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.nextRunAt = null;
  }

  getStatus() {
    return {
      enabled: this.settings.enabled,
      intervalMinutes: this.settings.intervalMinutes,
      startedAt: this.startedAt,
      nextRunAt: this.nextRunAt,
      running: this.running,
      lastRun: this.lastRun,
    };
  }
}

export function getUsageCheckScheduler(): UsageCheckScheduler {
  if (!appGlobal.usageCheckScheduler) {
    appGlobal.usageCheckScheduler = new UsageCheckScheduler();
  }
  return appGlobal.usageCheckScheduler;
}

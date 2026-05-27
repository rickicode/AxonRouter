import { getCurrentProviderConnections } from "@/lib/connectionAccess";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { runDedupedUsageRefreshJob } from "@/lib/usageRefreshQueue";
import { refreshUsageWithTransientSkip } from "@/lib/usageRefreshAccess";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";
import { normalizeUsageCheckSettings } from "@/lib/localDb/normalize";

const appGlobal = ((global as any).__appSingleton ??= {});

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
    this.settings = normalizeUsageCheckSettings({});
  }

  async loadSettings() {
    const dbSettings: any = await getCurrentSettings();
    this.settings = normalizeUsageCheckSettings(dbSettings.usageCheck || {});
    return this.settings;
  }

  async start() {
    this.startedAt = this.startedAt || new Date().toISOString();
    await this.loadSettings();

    if (this.settings.enabled !== true) {
      this.logger.log?.("[UsageCheck] Scheduler disabled via settings");
      return this.getStatus();
    }

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
      return { skipped: true, reason: "already_running", lastRun: this.lastRun };
    }

    this.running = true;
    this.nextRunAt = null;
    const startedAt = new Date().toISOString();

    try {
      await this.loadSettings();
      if (this.settings.enabled !== true) {
        return this.getStatus();
      }

      const allConnections = await getCurrentProviderConnections({ isActive: true });
      const oauthConnections = (allConnections || []).filter(
        (conn: any) =>
          conn.authType === "oauth" &&
          USAGE_SUPPORTED_PROVIDERS.includes(conn.provider),
      );

      const totalConnections = oauthConnections.length;
      let refreshedCount = 0;
      let errorCount = 0;

      const CONCURRENCY = 3;
      const oauthConnectionsCopy = [...oauthConnections];
      const results: PromiseSettledResult<unknown>[] = [];

      while (oauthConnectionsCopy.length > 0) {
        const batch = oauthConnectionsCopy.splice(0, CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map((conn: any) =>
            runDedupedUsageRefreshJob(conn.id, () =>
              refreshUsageWithTransientSkip(conn.id),
            ),
          ),
        );
        results.push(...batchResults);
      }

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

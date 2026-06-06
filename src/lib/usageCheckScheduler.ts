import { getCurrentProviderConnections } from "@/lib/connectionAccess";
import { getCurrentSettings } from "@/lib/settingsAccess";
import {
  getCanonicalUsageWorkerBatchSize,
  runCanonicalUsageWorker,
} from "@/lib/canonicalUsageWorker";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";
import { normalizeUsageCheckSettings } from "@/lib/localDb/normalize";

const appGlobal = ((global as any).__appSingleton ??= {});

const SCHEDULER_PER_CONNECTION_TIMEOUT_MS = 30000; // 30s max per connection
const SCHEDULER_ENQUEUE_BATCH_SIZE = 25;
const SCHEDULER_JITTER_MIN_PCT = 0.25;
const SCHEDULER_JITTER_MAX_PCT = 0.45;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId!));
}

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
  stopped: boolean;
  startedAt: string | null;
  nextRunAt: string | null;
  lastRun: UsageCheckLastRun | null;
  settings: { enabled: boolean; intervalMinutes: number };

  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.timerId = null;
    this.running = false;
    this.stopped = false;
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
    this.stopped = false;
    await this.loadSettings();

    if (this.settings.enabled !== true) {
      this.logger.log?.("[UsageCheck] Scheduler disabled via settings");
      return this.getStatus();
    }

    // Don't reschedule if already running - the finally block will handle it
    if (!this.running) {
      this.scheduleNext();
    }
    this.logger.log?.("[UsageCheck] Scheduler started");
    return this.getStatus();
  }

  scheduleNext() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    const baseMs = this.settings.intervalMinutes * 60 * 1000;
    const jitter = baseMs * (SCHEDULER_JITTER_MIN_PCT + Math.random() * (SCHEDULER_JITTER_MAX_PCT - SCHEDULER_JITTER_MIN_PCT));
    const intervalMs = baseMs + Math.round(jitter);
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

      // Skip connections in backoff (future nextRetryAt) or disabled/invalid
      const now = Date.now();
      const activeConnections = oauthConnections.filter((conn: any) => {
        // Skip disabled connections (auth invalid, deauthorized, etc.)
        if (conn?.routingStatus === "disabled" || conn?.authState === "invalid") {
          return false;
        }
        // Skip connections with future nextRetryAt (in backoff)
        if (conn?.nextRetryAt) {
          const retryAt = new Date(conn.nextRetryAt).getTime();
          if (Number.isFinite(retryAt) && retryAt > now) {
            return false;
          }
        }
        return true;
      });
      const skippedCount = oauthConnections.length - activeConnections.length;
      const originalTotal = oauthConnections.length;

      const totalConnections = activeConnections.length;
      let refreshedCount = 0;
      let errorCount = 0;

      const batchSize = getCanonicalUsageWorkerBatchSize(SCHEDULER_ENQUEUE_BATCH_SIZE);
      for (let index = 0; index < activeConnections.length; index += batchSize) {
        const batch = activeConnections.slice(index, index + batchSize);
        const results = await Promise.allSettled(
          batch.map((conn: any) =>
            withTimeout(
              runCanonicalUsageWorker({
                connectionId: conn.id,
                trigger: "scheduled",
                skipTransientConnectivityErrors: true,
              }),
              SCHEDULER_PER_CONNECTION_TIMEOUT_MS,
            ),
          ),
        );

        for (const result of results) {
          if (result.status === "fulfilled") refreshedCount++;
          else errorCount++;
        }
      }

      const completedAt = new Date().toISOString();
      const status = errorCount === 0 ? "success" : "partial";
      const message =
        skippedCount > 0
          ? `Refreshed ${refreshedCount}/${totalConnections}, ${errorCount} errors, ${skippedCount}/${originalTotal} skipped (backoff)`
          : errorCount === 0
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
      if (this.settings.enabled === true && !this.stopped) {
        this.scheduleNext();
      }
    }
  }

  async reloadSettings() {
    await this.loadSettings();
    if (this.settings.enabled) {
      this.scheduleNext();
    } else {
      this.stop();
    }
    return this.getStatus();
  }

  stop() {
    this.stopped = true;
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

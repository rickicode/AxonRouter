import { getCurrentSettings } from "@/lib/settingsAccess";
import { normalizeModelSyncSettings } from "@/lib/providerModels/syncSettings";
import { runModelSyncBatch } from "@/lib/providerModels/syncRunner";
import { syncNoAuthProviderModels } from "@/lib/providerModels/noAuthSync";

const appGlobal = (global as any).__appSingleton ??= {};

type ModelSyncSettings = ReturnType<typeof normalizeModelSyncSettings>;

type ModelSyncLastRun = {
  startedAt: string | null;
  status: string;
  message: string;
  total: number;
};

export class ModelSyncScheduler {
  logger: any;
  timerId: ReturnType<typeof setTimeout> | null;
  running: boolean;
  startedAt: string | null;
  nextRunAt: string | null;
  lastRun: ModelSyncLastRun | null;
  settings: ModelSyncSettings;

  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.timerId = null;
    this.running = false;
    this.startedAt = null;
    this.nextRunAt = null;
    this.lastRun = null;
    this.settings = normalizeModelSyncSettings({});
  }

  async loadSettings() {
    const dbSettings: any = await getCurrentSettings();
    this.settings = normalizeModelSyncSettings(dbSettings.modelSync || {});
    return this.settings;
  }

  async start() {
    this.startedAt = this.startedAt || new Date().toISOString();
    await this.loadSettings();

    if (this.settings.enabled !== true) {
      // Even when full sync is disabled, schedule periodic noAuth provider sync
      this.scheduleNoAuthOnly();
      this.logger.log?.("[ModelSync] Full sync disabled; noAuth auto-sync active");
      return this.getStatus();
    }

    this.scheduleNext();
    return this.getStatus();
  }

  scheduleNoAuthOnly() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    // Run noAuth sync every 2 days
    const intervalMs = 2 * 24 * 60 * 60 * 1000;
    this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    this.timerId = setTimeout(() => {
      syncNoAuthProviderModels()
        .catch((error) => this.logger.error?.("[ModelSync] noAuth sync failed:", error))
        .finally(() => this.scheduleNoAuthOnly());
    }, intervalMs);
    if (typeof this.timerId?.unref === "function") {
      this.timerId.unref();
    }
  }

  scheduleNext() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.settings.enabled !== true) return;

    const intervalMs = this.settings.intervalMinutes * 60 * 1000;
    this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    this.timerId = setTimeout(() => {
      this.runScheduled().catch((error) => {
        this.logger.error?.("[ModelSync] Scheduled run failed:", error);
      });
    }, intervalMs);

    if (typeof this.timerId?.unref === "function") {
      this.timerId.unref();
    }
  }

  async runScheduled() {
    if (this.running) {
      this.logger.warn?.("[ModelSync] Run already active, skipping scheduled tick");
      return this.lastRun;
    }

    this.running = true;
    this.nextRunAt = null;
    try {
      await this.loadSettings();
      if (this.settings.enabled !== true) {
        return this.getStatus();
      }

      const result = await runModelSyncBatch();
      this.lastRun = {
        startedAt: result.startedAt,
        status: result.status,
        message: result.message,
        total: Array.isArray(result.results) ? result.results.length : 0,
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
      enabled: this.settings.enabled === true,
      intervalMinutes: this.settings.intervalMinutes,
      startedAt: this.startedAt,
      nextRunAt: this.nextRunAt,
      running: this.running,
      lastRun: this.lastRun,
    };
  }
}

export function getModelSyncScheduler(): ModelSyncScheduler {
  if (!appGlobal.modelSyncScheduler) {
    appGlobal.modelSyncScheduler = new ModelSyncScheduler();
  }
  return appGlobal.modelSyncScheduler;
}

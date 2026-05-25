// Usage Worker Configuration

export const USAGE_WORKER_DEFAULTS = {
  enabled: true,
  intervalMinutes: 60,
  cadenceMs: 60 * 60 * 1000,
};

type UsageWorkerSettingsInput = {
  enabled?: boolean;
  intervalMinutes?: number;
  cadenceMs?: number;
};

export function normalizeUsageWorkerSettings(settings: UsageWorkerSettingsInput = {}) {
  const source: UsageWorkerSettingsInput = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const legacyCadenceMinutes = Number.isFinite(source.cadenceMs) ? Math.round(source.cadenceMs / 60000) : null;
  const intervalMinutes = Number.isFinite(source.intervalMinutes)
    ? source.intervalMinutes
    : legacyCadenceMinutes;

  const merged = {
    ...USAGE_WORKER_DEFAULTS,
    ...source,
    intervalMinutes,
  };

  merged.enabled = typeof merged.enabled === "boolean" ? merged.enabled : USAGE_WORKER_DEFAULTS.enabled;
  merged.intervalMinutes = Number.isFinite(merged.intervalMinutes) && merged.intervalMinutes >= 5
    ? Math.trunc(merged.intervalMinutes)
    : USAGE_WORKER_DEFAULTS.intervalMinutes;
  merged.cadenceMs = merged.intervalMinutes * 60 * 1000;

  return merged;
}

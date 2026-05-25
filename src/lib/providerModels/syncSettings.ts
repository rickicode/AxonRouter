export const DEFAULT_MODEL_SYNC_SETTINGS = Object.freeze({
  enabled: true,
  intervalMinutes: 2880,
  providers: {},
  lastRunAt: null,
  lastRunStatus: "idle",
  lastRunMessage: "",
});

function toPositiveInteger(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.max(1, Math.round(num));
}

function normalizeProviderMap(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input)
      .filter(([providerId]) => typeof providerId === "string" && providerId.trim())
      .map(([providerId, value]) => {
        const record: any = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        return [providerId, {
          enabled: record.enabled !== false,
          intervalMinutes: toPositiveInteger(record.intervalMinutes, DEFAULT_MODEL_SYNC_SETTINGS.intervalMinutes),
          lastRunAt: typeof record.lastRunAt === "string" ? record.lastRunAt : null,
          lastRunStatus: typeof record.lastRunStatus === "string" ? record.lastRunStatus : "idle",
          lastRunMessage: typeof record.lastRunMessage === "string" ? record.lastRunMessage : "",
        }];
      })
  );
}

export function normalizeModelSyncSettings(input: unknown = {}) {
  const record: any = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    enabled: record.enabled !== false,
    intervalMinutes: toPositiveInteger(record.intervalMinutes, DEFAULT_MODEL_SYNC_SETTINGS.intervalMinutes),
    providers: normalizeProviderMap(record.providers),
    lastRunAt: typeof record.lastRunAt === "string" ? record.lastRunAt : null,
    lastRunStatus: typeof record.lastRunStatus === "string" ? record.lastRunStatus : "idle",
    lastRunMessage: typeof record.lastRunMessage === "string" ? record.lastRunMessage : "",
  };
}

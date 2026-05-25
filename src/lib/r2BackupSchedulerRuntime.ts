type LocalDbModule = typeof import("@/lib/localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentR2SchedulerSettings() {
  const { getSettings } = await loadLocalDb();
  return getSettings();
}

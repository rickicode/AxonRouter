type LocalDbModule = typeof import("@/lib/localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function exportCurrentDb() {
  const { exportDb } = await loadLocalDb();
  return exportDb();
}

export async function getCurrentLocalSettings() {
  const { getSettings } = await loadLocalDb();
  return getSettings();
}

export async function getCurrentProviderConnections() {
  const { getProviderConnections } = await loadLocalDb();
  return getProviderConnections();
}

export async function prepareCurrentLocalDbForRestore() {
  const { prepareLocalDbForExternalRestore } = await loadLocalDb();
  return prepareLocalDbForExternalRestore();
}

export async function reloadCurrentLocalDbAfterRestore() {
  const { reloadLocalDbAfterExternalRestore } = await loadLocalDb();
  return reloadLocalDbAfterExternalRestore();
}

export async function updateCurrentLocalSettings(updates: Record<string, unknown>) {
  const { updateSettings } = await loadLocalDb();
  return updateSettings(updates);
}

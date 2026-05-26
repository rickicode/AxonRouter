type LocalDbModule = typeof import("./localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("./localDb");
}

export async function getCurrentSettings() {
  const { getSettings } = await loadLocalDb();
  return getSettings();
}

export async function updateCurrentSettings(updates: Record<string, unknown>) {
  const { updateSettings } = await loadLocalDb();
  return updateSettings(updates);
}

export async function atomicUpdateCurrentSettings(
  updater: (current: any) => any | Promise<any>
) {
  const { atomicUpdateSettings } = await loadLocalDb();
  return atomicUpdateSettings(updater);
}

export async function getCurrentProviderConnections(filters?: Record<string, unknown>) {
  const { getProviderConnections } = await loadLocalDb();
  return getProviderConnections(filters);
}

export async function getDefaultCurrentChatRuntimeSettings() {
  const { getDefaultChatRuntimeSettings } = await loadLocalDb();
  return getDefaultChatRuntimeSettings();
}

export async function normalizeCurrentChatRuntimeSettings(settings: Record<string, unknown>) {
  const { normalizeChatRuntimeSettings } = await loadLocalDb();
  return normalizeChatRuntimeSettings(settings);
}

export async function normalizeCurrentMorphSettings(settings: Record<string, unknown>) {
  const { normalizeMorphSettings } = await loadLocalDb();
  return normalizeMorphSettings(settings);
}

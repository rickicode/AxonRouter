type LocalDbModule = typeof import("./localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("./localDb");
}

export async function getCurrentProviderConnections(filters?: Record<string, unknown>) {
  const { getProviderConnections } = await loadLocalDb();
  return getProviderConnections(filters);
}

export async function getActiveProviderConnection(provider: string) {
  const connections = await getCurrentProviderConnections({
    provider,
    isActive: true,
  });
  return Array.isArray(connections) ? connections[0] || null : null;
}

export async function getCurrentProviderConnectionById(id: string) {
  const { getProviderConnectionById } = await loadLocalDb();
  return getProviderConnectionById(id);
}

export async function getCurrentProxyPoolById(id: string) {
  const { getProxyPoolById } = await loadLocalDb();
  return getProxyPoolById(id);
}

export async function validateCurrentApiKey(apiKey: string) {
  const { validateApiKey } = await loadLocalDb();
  return validateApiKey(apiKey);
}

export async function getCurrentModelAliases() {
  const { getModelAliases } = await loadLocalDb();
  return getModelAliases();
}

export async function getCurrentOpenCodePreferences() {
  const { getOpenCodePreferences } = await loadLocalDb();
  return getOpenCodePreferences();
}

export async function updateCurrentOpenCodePreferences(data: Record<string, unknown>) {
  const { updateOpenCodePreferences } = await loadLocalDb();
  return updateOpenCodePreferences(data);
}

export async function createCurrentProviderConnection(data: any) {
  const { createProviderConnection } = await loadLocalDb();
  return createProviderConnection(data);
}

export async function updateCurrentProviderConnection(id: string | number, data: any) {
  const { updateProviderConnection } = await loadLocalDb();
  return updateProviderConnection(id, data);
}

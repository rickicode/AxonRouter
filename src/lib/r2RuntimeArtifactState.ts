type LocalDbModule = typeof import("@/lib/localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function exportCurrentArtifactDb() {
  const { exportDb } = await loadLocalDb();
  return exportDb();
}

export async function getCurrentArtifactProviderConnections() {
  const { getProviderConnections } = await loadLocalDb();
  return getProviderConnections();
}

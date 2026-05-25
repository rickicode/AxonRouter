type LocalDbModule = typeof import("./localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("./localDb");
}

export async function updateCurrentProviderConnection(connectionId: string, data: any) {
  const { updateProviderConnection } = await loadLocalDb();
  return updateProviderConnection(connectionId, data);
}

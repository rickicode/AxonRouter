type LocalDbModule = Pick<
  typeof import("@/lib/localDb"),
  "getProviderConnectionById" | "createProviderConnection" | "updateProviderConnection" | "deleteProviderConnection" | "getProxyPoolById"
>;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentProviderConnectionById(id: string) {
  const { getProviderConnectionById } = await loadLocalDb();
  return getProviderConnectionById(id);
}

export async function createCurrentProviderConnection(data: Record<string, unknown>) {
  const { createProviderConnection } = await loadLocalDb();
  return createProviderConnection(data);
}

export async function updateCurrentProviderConnection(id: string, data: Record<string, unknown>) {
  const { updateProviderConnection } = await loadLocalDb();
  return updateProviderConnection(id, data);
}

export async function deleteCurrentProviderConnection(id: string) {
  const { deleteProviderConnection } = await loadLocalDb();
  return deleteProviderConnection(id);
}

export async function getCurrentProxyPoolById(id: string) {
  const { getProxyPoolById } = await loadLocalDb();
  return getProxyPoolById(id);
}

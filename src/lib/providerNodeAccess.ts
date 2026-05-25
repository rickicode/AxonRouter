type LocalDbModule = Pick<
  typeof import("@/lib/localDb"),
  "getProviderNodes" | "getProviderNodeById" | "createProviderNode" | "updateProviderNode" | "deleteProviderNode" | "deleteProviderConnectionsByProvider"
>;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentProviderNodes() {
  const { getProviderNodes } = await loadLocalDb();
  return getProviderNodes();
}

export async function getCurrentProviderNodeById(id: string) {
  const { getProviderNodeById } = await loadLocalDb();
  return getProviderNodeById(id);
}

export async function createCurrentProviderNode(data: Record<string, unknown>) {
  const { createProviderNode } = await loadLocalDb();
  return createProviderNode(data);
}

export async function updateCurrentProviderNode(id: string, data: Record<string, unknown>) {
  const { updateProviderNode } = await loadLocalDb();
  return updateProviderNode(id, data);
}

export async function deleteCurrentProviderNode(id: string) {
  const { deleteProviderNode } = await loadLocalDb();
  return deleteProviderNode(id);
}

export async function deleteCurrentProviderConnectionsByProvider(providerId: string) {
  const { deleteProviderConnectionsByProvider } = await loadLocalDb();
  return deleteProviderConnectionsByProvider(providerId);
}

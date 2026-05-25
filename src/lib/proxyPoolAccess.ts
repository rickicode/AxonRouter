type LocalDbModule = Pick<
  typeof import("@/lib/localDb"),
  "getProxyPools" | "getProxyPoolById" | "createProxyPool" | "updateProxyPool" | "deleteProxyPool"
>;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentProxyPools(filters?: Record<string, unknown>) {
  const { getProxyPools } = await loadLocalDb();
  return getProxyPools(filters);
}

export async function getCurrentProxyPoolById(id: string) {
  const { getProxyPoolById } = await loadLocalDb();
  return getProxyPoolById(id);
}

export async function createCurrentProxyPool(data: Record<string, unknown>) {
  const { createProxyPool } = await loadLocalDb();
  return createProxyPool(data);
}

export async function updateCurrentProxyPool(id: string, data: Record<string, unknown>) {
  const { updateProxyPool } = await loadLocalDb();
  return updateProxyPool(id, data);
}

export async function deleteCurrentProxyPool(id: string) {
  const { deleteProxyPool } = await loadLocalDb();
  return deleteProxyPool(id);
}

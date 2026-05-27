type LocalDbModule = Pick<
  typeof import("@/lib/localDb"),
  "getProxyGroups" | "getProxyGroupById" | "createProxyGroup" | "updateProxyGroup" | "deleteProxyGroup"
>;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentProxyGroups(filters?: Record<string, unknown>) {
  const { getProxyGroups } = await loadLocalDb();
  return getProxyGroups(filters);
}

export async function getCurrentProxyGroupById(id: string) {
  const { getProxyGroupById } = await loadLocalDb();
  return getProxyGroupById(id);
}

export async function createCurrentProxyGroup(data: Record<string, unknown>) {
  const { createProxyGroup } = await loadLocalDb();
  return createProxyGroup(data);
}

export async function updateCurrentProxyGroup(id: string, data: Record<string, unknown>) {
  const { updateProxyGroup } = await loadLocalDb();
  return updateProxyGroup(id, data);
}

export async function deleteCurrentProxyGroup(id: string) {
  const { deleteProxyGroup } = await loadLocalDb();
  return deleteProxyGroup(id);
}

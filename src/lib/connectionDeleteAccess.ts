type LocalDbModule = Pick<typeof import("@/lib/localDb"), "deleteProviderConnection">;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function deleteCurrentProviderConnection(id: string) {
  const { deleteProviderConnection } = await loadLocalDb();
  return deleteProviderConnection(id);
}

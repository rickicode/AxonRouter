type LocalDbModule = Pick<typeof import("@/lib/localDb"), "getProviderNodeById">;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentProviderNodeById(id: string) {
  const { getProviderNodeById } = await loadLocalDb();
  return getProviderNodeById(id);
}

type LocalDbModule = Pick<typeof import("@/lib/localDb"), "getProviderConnections">;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentActiveProviderConnections() {
  const { getProviderConnections } = await loadLocalDb();
  return getProviderConnections({ isActive: true });
}

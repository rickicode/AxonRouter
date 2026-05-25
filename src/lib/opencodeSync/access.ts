type LocalDbModule = Pick<
  typeof import("@/lib/localDb"),
  "getOpenCodePreferences" | "listOpenCodeTokens" | "mutateOpenCodeTokens" | "touchOpenCodeTokenLastUsedAt"
>;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentOpenCodeSyncPreferences() {
  const { getOpenCodePreferences } = await loadLocalDb();
  return getOpenCodePreferences();
}

export async function listCurrentOpenCodeTokens() {
  const { listOpenCodeTokens } = await loadLocalDb();
  return listOpenCodeTokens();
}

export async function mutateCurrentOpenCodeTokens(
  updater: (tokens: any[]) => { tokens: any[] }
) {
  const { mutateOpenCodeTokens } = await loadLocalDb();
  return mutateOpenCodeTokens(updater);
}

export async function touchCurrentOpenCodeTokenLastUsedAt(id: string) {
  const { touchOpenCodeTokenLastUsedAt } = await loadLocalDb();
  return touchOpenCodeTokenLastUsedAt(id);
}

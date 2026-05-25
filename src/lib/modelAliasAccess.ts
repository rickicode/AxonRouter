type LocalDbModule = Pick<
  typeof import("@/lib/localDb"),
  "getModelAliases" | "setModelAlias" | "deleteModelAlias"
>;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentModelAliases() {
  const { getModelAliases } = await loadLocalDb();
  return getModelAliases();
}

export async function setCurrentModelAlias(alias: string, model: string) {
  const { setModelAlias } = await loadLocalDb();
  return setModelAlias(alias, model);
}

export async function setCurrentModelAliasByModel(model: string, alias: string) {
  const { setModelAlias } = await loadLocalDb();
  return setModelAlias(model, alias);
}

export async function deleteCurrentModelAlias(alias: string) {
  const { deleteModelAlias } = await loadLocalDb();
  return deleteModelAlias(alias);
}

type LocalDbModule = Pick<typeof import("@/lib/localDb"), "getCombos" | "getProviderConnections" | "getCustomModels" | "addCustomModel" | "deleteCustomModel" | "getSyncedAvailableModelsForConnection" | "replaceSyncedAvailableModelsForConnection" | "getAllSyncedAvailableModels" | "getOpenCodePreferences" | "listOpenCodeTokens" | "mutateOpenCodeTokens" | "touchOpenCodeTokenLastUsedAt" | "getComboByName" | "createCombo" | "getComboById" | "updateCombo" | "renameComboWithDependents" | "deleteCombo" | "reorderCombos" | "getDisabledModels" | "disableModels" | "enableModels" | "getProviderNodes" | "getModelComboMappings" | "createModelComboMapping" | "getModelComboMappingById" | "updateModelComboMapping" | "deleteModelComboMapping" | "getMitmAlias" | "setMitmAliasAll">;

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentCombos() {
  const { getCombos } = await loadLocalDb();
  return getCombos();
}

export async function getCurrentComboByName(name: string) {
  const { getComboByName } = await loadLocalDb();
  return getComboByName(name);
}

export async function createCurrentCombo(data: Record<string, unknown>) {
  const { createCombo } = await loadLocalDb();
  return createCombo(data);
}

export async function getCurrentComboById(id: string) {
  const { getComboById } = await loadLocalDb();
  return getComboById(id);
}

export async function updateCurrentCombo(id: string, data: Record<string, unknown>) {
  const { updateCombo } = await loadLocalDb();
  return updateCombo(id, data);
}

export async function renameCurrentComboWithDependents(id: string, updateData: Record<string, unknown>, oldName: string, newName: string) {
  const { renameComboWithDependents } = await loadLocalDb();
  return renameComboWithDependents(id, updateData, oldName, newName);
}

export async function deleteCurrentCombo(id: string) {
  const { deleteCombo } = await loadLocalDb();
  return deleteCombo(id);
}

export async function reorderCurrentCombos(comboIds: string[]) {
  const { reorderCombos } = await loadLocalDb();
  return reorderCombos(comboIds);
}

export async function getCurrentDisabledModels() {
  const { getDisabledModels } = await loadLocalDb();
  return getDisabledModels();
}

export async function disableCurrentModels(providerAlias: string, ids: string[]) {
  const { disableModels } = await loadLocalDb();
  return disableModels(providerAlias, ids);
}

export async function enableCurrentModels(providerAlias: string, ids: string[]) {
  const { enableModels } = await loadLocalDb();
  return enableModels(providerAlias, ids);
}

export async function getCurrentProviderNodes(filter?: Record<string, unknown>) {
  const { getProviderNodes } = await loadLocalDb();
  return getProviderNodes(filter);
}

export async function getCurrentModelComboMappings() {
  const { getModelComboMappings } = await loadLocalDb();
  return getModelComboMappings();
}

export async function createCurrentModelComboMapping(data: Record<string, unknown>) {
  const { createModelComboMapping } = await loadLocalDb();
  return createModelComboMapping(data);
}

export async function getCurrentModelComboMappingById(id: string) {
  const { getModelComboMappingById } = await loadLocalDb();
  return getModelComboMappingById(id);
}

export async function updateCurrentModelComboMapping(id: string, data: Record<string, unknown>) {
  const { updateModelComboMapping } = await loadLocalDb();
  return updateModelComboMapping(id, data);
}

export async function deleteCurrentModelComboMapping(id: string) {
  const { deleteModelComboMapping } = await loadLocalDb();
  return deleteModelComboMapping(id);
}

export async function getCurrentMitmAlias(toolName?: string) {
  const { getMitmAlias } = await loadLocalDb();
  return getMitmAlias(toolName);
}

export async function setCurrentMitmAliasAll(toolName: string, mappings: Record<string, string>) {
  const { setMitmAliasAll } = await loadLocalDb();
  return setMitmAliasAll(toolName, mappings);
}

export async function getCurrentProviderConnections() {
  const { getProviderConnections } = await loadLocalDb();
  return getProviderConnections();
}

export async function getCurrentCustomModels() {
  const { getCustomModels } = await loadLocalDb();
  return getCustomModels();
}

export async function addCurrentCustomModel(model: {
  providerAlias: string;
  id: string;
  type?: string;
  name: string | null | undefined;
}) {
  const { addCustomModel } = await loadLocalDb();
  return addCustomModel(model);
}

export async function deleteCurrentCustomModel(model: {
  providerAlias: string;
  id: string;
  type?: string;
}) {
  const { deleteCustomModel } = await loadLocalDb();
  return deleteCustomModel(model);
}

export async function getCurrentSyncedAvailableModelsForConnection(
  providerId: string,
  connectionId: string
) {
  const { getSyncedAvailableModelsForConnection } = await loadLocalDb();
  return getSyncedAvailableModelsForConnection(providerId, connectionId);
}

export async function replaceCurrentSyncedAvailableModelsForConnection(
  providerId: string,
  connectionId: string,
  models: any[]
) {
  const { replaceSyncedAvailableModelsForConnection } = await loadLocalDb();
  return replaceSyncedAvailableModelsForConnection(providerId, connectionId, models);
}

export async function getCurrentAllSyncedAvailableModels() {
  const { getAllSyncedAvailableModels } = await loadLocalDb();
  return getAllSyncedAvailableModels();
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

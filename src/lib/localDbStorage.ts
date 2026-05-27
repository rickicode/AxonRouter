import { ensureDataDir, getDbJsonFile as getDbJsonFilePath, dataFileExists } from "./dataDir";
import {
  getDbSqliteFile,
  clearHotStateForProvider,
  closeSqliteDb,
  deleteEntity,
  ensureSchema,
  getSqliteDb,
  markProviderHotStateInvalidated,
  rebuildHotStateFromConnections,
  upsertEntities,
  upsertEntity,
  upsertSingleton,
} from "./sqliteHelpers";
import {
  loadAllDataFromSqlite,
  loadSingletonFromSqlite,
  migrateFromJSON,
  saveAllDataToSqlite,
} from "./sqliteBootstrap";

const isCloudStorage = typeof caches !== "undefined" && typeof caches === "object";

let _dbJsonFile: string | null | undefined;
function getDbJsonFile() {
  if (_dbJsonFile !== undefined) return _dbJsonFile;
  _dbJsonFile = isCloudStorage ? null : getDbJsonFilePath();
  return _dbJsonFile;
}

function ensureDataDirExists() {
  if (isCloudStorage) return;
  ensureDataDir();
}

export function loadSqliteStorageState() {
  if (isCloudStorage || !dataFileExists(getDbSqliteFile())) {
    return null;
  }

  const data: any = loadAllDataFromSqlite();
  if (loadSingletonFromSqlite("opencodeSync") == null) {
    delete data.opencodeSync;
  }

  return data;
}

export function savePersistentStorage(data: unknown) {
  if (isCloudStorage) return;
  ensureDataDirExists();
  saveAllDataToSqlite(data);
}

export function bootstrapPersistentStorage() {
  if (isCloudStorage) return;
  ensureDataDirExists();

  if (getDbJsonFile() && dataFileExists(getDbJsonFile()!) && !dataFileExists(getDbSqliteFile())) {
    migrateFromJSON();
    return;
  }

  const sqliteDb = getSqliteDb();
  ensureSchema(sqliteDb);
}

export function closePersistentStorage() {
  if (isCloudStorage) return;
  closeSqliteDb();
}

export {
  clearHotStateForProvider,
  deleteEntity,
  markProviderHotStateInvalidated,
  rebuildHotStateFromConnections,
  upsertEntities,
  upsertEntity,
  upsertSingleton,
};

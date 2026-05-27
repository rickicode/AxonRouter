import path from "node:path";
import fs from "node:fs";

import { getDataDir } from "./dataDir";
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
  _dbJsonFile = isCloudStorage ? null : path.join(getDataDir(), "db.json");
  return _dbJsonFile;
}

function ensureDataDirExists() {
  if (isCloudStorage) return;
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function loadSqliteStorageState() {
  if (isCloudStorage || !fs.existsSync(getDbSqliteFile())) {
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

  if (getDbJsonFile() && fs.existsSync(getDbJsonFile()!) && !fs.existsSync(getDbSqliteFile())) {
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

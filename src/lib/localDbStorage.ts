import path from "node:path";
import fs from "node:fs";

import { getDataDir } from "./dataDir";
import {
  DB_SQLITE_FILE,
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
const DB_JSON_FILE = isCloudStorage ? null : path.join(getDataDir(), "db.json");

function ensureDataDirExists() {
  if (isCloudStorage) return;
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function loadSqliteStorageState() {
  if (isCloudStorage || !fs.existsSync(DB_SQLITE_FILE)) {
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

  if (DB_JSON_FILE && fs.existsSync(DB_JSON_FILE) && !fs.existsSync(DB_SQLITE_FILE)) {
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

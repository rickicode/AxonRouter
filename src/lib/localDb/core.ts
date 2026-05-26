import { isHotStateKey } from "../hotStateKeys";
import {
  bootstrapPersistentStorage,
  closePersistentStorage,
  deleteEntity,
  loadSqliteStorageState,
  rebuildHotStateFromConnections,
  savePersistentStorage,
  upsertEntities,
  upsertEntity,
  upsertSingleton,
} from "../localDbStorage";
import { sqliteWriteGate } from "../sqliteWriteGate";
import { clearAllHotState } from "../providerHotState";
import { getConnectionEffectiveStatus } from "../connectionStatus";

import {
  isCloud,
  isPlainObject,
  mergeSettingsWithDefaults,
  normalizeSyncedAvailableModelsMap,
  normalizeStoredProviderSpecificData,
  shouldSeedEligibility,
  buildEligibilityRecoveryPatch,
  cloneDefaultData,
  logSafeError,
} from "./normalize";

export { getConnectionEffectiveStatus };

export function ensureDbShape(data) {
  const defaults = cloneDefaultData();
  const next = data && typeof data === "object" ? data : {};
  let changed = false;

  if (Array.isArray(next.providerConnections)) {
    for (const connection of next.providerConnections) {
      const normalizedProviderSpecificData = normalizeStoredProviderSpecificData(
        connection?.provider,
        connection?.providerSpecificData,
      );
      const hadProviderSpecificData = Boolean(connection?.providerSpecificData);

      if (normalizedProviderSpecificData) {
        if (JSON.stringify(normalizedProviderSpecificData) !== JSON.stringify(connection.providerSpecificData || {})) {
          connection.providerSpecificData = normalizedProviderSpecificData;
          changed = true;
        }
      } else if (hadProviderSpecificData) {
        delete connection.providerSpecificData;
        changed = true;
      }

      if (!shouldSeedEligibility(connection)) continue;
      Object.assign(connection, buildEligibilityRecoveryPatch());
      changed = true;
    }
  }

  if (isPlainObject(next.syncedAvailableModels)) {
    const normalizedSyncedAvailableModels = normalizeSyncedAvailableModelsMap(next.syncedAvailableModels);
    if (JSON.stringify(normalizedSyncedAvailableModels) !== JSON.stringify(next.syncedAvailableModels)) {
      next.syncedAvailableModels = normalizedSyncedAvailableModels;
      changed = true;
    }
  }

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (next[key] === undefined || next[key] === null) {
      next[key] = defaultValue;
      changed = true;
      continue;
    }

    if (key === "settings" && (typeof next.settings !== "object" || Array.isArray(next.settings))) {
      next.settings = { ...defaultValue };
      changed = true;
      continue;
    }

    if (key === "settings" && typeof next.settings === "object" && !Array.isArray(next.settings)) {
      for (const [settingKey, settingDefault] of Object.entries(defaultValue)) {
        if (next.settings[settingKey] === undefined) {
          if (
            settingKey === "outboundProxyEnabled" &&
            typeof next.settings.outboundProxyUrl === "string" &&
            next.settings.outboundProxyUrl.trim()
          ) {
            next.settings.outboundProxyEnabled = true;
          } else {
            next.settings[settingKey] = settingDefault;
          }
          changed = true;
        }
      }

      const mergedSettings = mergeSettingsWithDefaults(next.settings);
      if (JSON.stringify(mergedSettings) !== JSON.stringify(next.settings)) {
        next.settings = mergedSettings;
        changed = true;
      }
    }

    if (key === "apiKeys" && Array.isArray(next.apiKeys)) {
      for (const apiKey of next.apiKeys) {
        if (apiKey.isActive === undefined || apiKey.isActive === null) {
          apiKey.isActive = true;
          changed = true;
        }
      }
    }

    if (key === "providerConnections" && Array.isArray(next.providerConnections)) {
      const seen = new Map();
      const duplicates = [];

      for (let i = 0; i < next.providerConnections.length; i++) {
        const conn = next.providerConnections[i];
        let uniqueKey;

        if (conn.authType === "oauth" && conn.email) {
          uniqueKey = `${conn.provider}:oauth:${conn.email}`;
        } else if (conn.authType === "apikey" && conn.name) {
          uniqueKey = `${conn.provider}:apikey:${conn.name}`;
        }

        if (uniqueKey) {
          if (seen.has(uniqueKey)) {
            console.warn(`[DB] Duplicate connection detected: ${uniqueKey} (id: ${conn.id}), marking for removal`);
            duplicates.push(i);
          } else {
            seen.set(uniqueKey, conn.id);
          }
        }
      }

      if (duplicates.length > 0) {
        for (let i = duplicates.length - 1; i >= 0; i--) {
          next.providerConnections.splice(duplicates[i], 1);
        }
        changed = true;
        console.warn(`[DB] Removed ${duplicates.length} duplicate connection(s)`);
      }
    }
  }

  return { data: next, changed };
}

// --- DB instance state ---

let dbInstance = null;
let dbCache = null;
let dbCacheExpiresAt = 0;
let sqliteInitPromise = null;

const DB_CACHE_TTL_MS = 1000;

class LocalMutex {
  _queue: Array<() => void>;
  _locked: boolean;
  static MAX_QUEUE = 100;

  constructor() {
    this._queue = [];
    this._locked = false;
  }

  async acquire(): Promise<() => void> {
    if (!this._locked) {
      this._locked = true;
      return () => this._release();
    }
    if (this._queue.length >= LocalMutex.MAX_QUEUE) {
      throw new Error('[DB] Write queue full — too many concurrent operations');
    }
    return new Promise((resolve) => {
      this._queue.push(() => resolve(() => this._release()));
    });
  }

  _release() {
    const next = this._queue.shift();
    if (next) next();
    else this._locked = false;
  }
}

const localMutex = new LocalMutex();

export async function withLocalDbMutex(operation) {
  const releaseLocal = await localMutex.acquire();
  try {
    await operation();
  } finally {
    releaseLocal();
  }
}

export async function safeRead(db) {
  const { data, rawData, normalizedKeys } = loadAllDataFromStorageState();
  db.data = data;
  db._rawDataFromStorage = rawData;
  db._normalizedKeysOnRead = new Set(normalizedKeys);
}

export function cloneDbData(data) {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
}

function createMemoryDb(data: any) {
  return {
    data,
    async read() {
      this.data = loadAllDataFromStorage();
    },
    async write() {
      saveAllDataToStorage(this.data);
    },
  };
}

function loadAllDataFromStorage() {
  return loadAllDataFromStorageState().data;
}

function loadAllDataFromStorageState() {
  const sqliteData = loadSqliteStorageState();
  if (sqliteData) {
    const rawData = cloneDbData(sqliteData);
    const { data } = ensureDbShape(sqliteData);
    return {
      data,
      rawData,
      normalizedKeys: getChangedTopLevelKeys(rawData, data),
    };
  }

  const data = cloneDefaultData();
  return {
    data,
    rawData: cloneDbData(data),
    normalizedKeys: [],
  };
}

function getChangedTopLevelKeys(beforeData, afterData) {
  const keys = new Set([
    ...Object.keys(beforeData || {}),
    ...Object.keys(afterData || {}),
  ]);

  return [...keys].filter((key) => JSON.stringify(beforeData?.[key]) !== JSON.stringify(afterData?.[key]));
}

function saveAllDataToStorage(data) {
  if (isCloud) {
    return;
  }

  const nextData = ensureDbShape(cloneDbData(data)).data;
  savePersistentStorage(nextData);
}

function hasFreshDbCache() {
  return dbCache !== null && Date.now() < dbCacheExpiresAt;
}

function setDbCache(data) {
  dbCache = cloneDbData(data);
  dbCacheExpiresAt = Date.now() + DB_CACHE_TTL_MS;
}

export function invalidateDbCache() {
  dbCache = null;
  dbCacheExpiresAt = 0;
}

export async function prepareLocalDbForExternalRestore() {
  if (isCloud) return;

  await withLocalDbMutex(async () => {
    invalidateDbCache();
    dbInstance = null;
    sqliteInitPromise = null;
    closePersistentStorage();
  });
}

export async function reloadLocalDbAfterExternalRestore() {
  if (isCloud) return null;

  let nextData = null;
  let connectionsForRebuild = [];

  await withLocalDbMutex(async () => {
    invalidateDbCache();
    dbInstance = null;
    sqliteInitPromise = null;

    await ensureSqliteBootstrap();

    if (!dbInstance) {
      dbInstance = createMemoryDb(cloneDefaultData());
    }

    await safeRead(dbInstance);

    if (!dbInstance.data) {
      dbInstance.data = cloneDefaultData();
    }

    setDbCache(dbInstance.data);
    nextData = dbInstance.data;
    connectionsForRebuild = Array.isArray(dbInstance.data.providerConnections)
      ? dbInstance.data.providerConnections.map((connection) => ({ ...connection }))
      : [];
  });

  await clearAllHotState();
  rebuildHotStateFromConnections(connectionsForRebuild);

  try {
    const { invalidateInternalProxyTokenCache } = await import("../internalProxyTokens");
    invalidateInternalProxyTokenCache();
  } catch {
    // Non-fatal: token cache will refresh on TTL expiry.
  }

  return nextData;
}

export function peekDbCacheArray(key) {
  if (!hasFreshDbCache()) return null;
  const value = dbCache?.[key];
  if (!Array.isArray(value)) return null;
  return value.slice();
}

export function peekDbCacheObject(key) {
  if (!hasFreshDbCache()) return null;
  const value = dbCache?.[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return { ...value };
}

async function ensureSqliteBootstrap() {
  if (isCloud) return;
  if (!sqliteInitPromise) {
    sqliteInitPromise = (async () => {
      try {
        bootstrapPersistentStorage();
      } catch (error) {
        logSafeError("[DB] SQLite bootstrap failed", error);
        sqliteInitPromise = null;
        throw error;
      }
    })();
  }

  try {
    await sqliteInitPromise;
  } catch (error) {
    sqliteInitPromise = null;
    throw error;
  }
}
function getProviderConnectionsFromLowDbData(db: any, filter: any = {}) {
  let connections = Array.isArray(db.data.providerConnections)
    ? db.data.providerConnections.slice()
    : [];

  if (filter.provider) connections = connections.filter((c) => c.provider === filter.provider);
  if (filter.isActive !== undefined) connections = connections.filter((c) => c.isActive === filter.isActive);

  connections.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  return connections;
}
export function filterAndSortConnections(connections: any, filter: any = {}) {
  let result = Array.isArray(connections) ? connections.slice() : [];
  if (filter.provider) result = result.filter((c) => c?.provider === filter.provider);
  if (filter.isActive !== undefined) result = result.filter((c) => c?.isActive === filter.isActive);
  result.sort((a, b) => (a?.priority || 999) - (b?.priority || 999));
  return result;
}

export async function getProviderConnectionsWithFallback(filter = {}) {
  const db = await getDb();
  return getProviderConnectionsFromLowDbData(db, filter);
}

function ensureDbShapeForWrite(db) {
  const { data } = ensureDbShape(db.data);
  db.data = data;
}

function isBusyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  return e.code === "SQLITE_BUSY" || (typeof e.message === "string" && e.message.includes("database is locked"));
}

function withBusyRetry<T>(fn: () => T, maxRetries = 5, baseDelayMs = 50): T {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      if (!isBusyError(err) || attempt === maxRetries) throw err;
      const delayMs = Math.min(baseDelayMs * 2 ** attempt, 1000);
      // Use Atomics.wait for sync sleep without burning CPU
      try {
        const buf = new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(buf, 0, 0, delayMs);
      } catch {
        // Fallback: yield via short busy loop if SharedArrayBuffer unavailable
        const end = Date.now() + delayMs;
        while (Date.now() < end) { /* fallback spin */ }
      }
    }
  }
  throw lastErr;
}

export async function persistDbWrite(db) {
  invalidateDbCache();
  ensureDbShapeForWrite(db);
  try {
    withBusyRetry(() => sqliteWriteGate(() => saveAllDataToStorage(db.data)));
    setDbCache(db.data);
  } catch (err) {
    const { data, rawData, normalizedKeys } = loadSqliteStorageState();
    db.data = data;
    db._rawDataFromStorage = rawData;
    db._normalizedKeysOnRead = new Set(normalizedKeys);
    throw err;
  }
}

export async function persistSingletonWrite(db, key) {
  invalidateDbCache();
  ensureDbShapeForWrite(db);
  try {
    withBusyRetry(() => sqliteWriteGate(() => upsertSingleton(key, db.data[key])));
    setDbCache(db.data);
    db._rawDataFromStorage = cloneDbData(db.data);
    db._normalizedKeysOnRead = new Set();
  } catch (err) {
    const { data, rawData, normalizedKeys } = loadSqliteStorageState();
    db.data = data;
    db._rawDataFromStorage = rawData;
    db._normalizedKeysOnRead = new Set(normalizedKeys);
    throw err;
  }
}

function getStoredCollectionSnapshot(db, collection) {
  const rawCollection = db?._rawDataFromStorage?.[collection];
  return Array.isArray(rawCollection) ? rawCollection : [];
}

function hasCollectionReadNormalization(db, collection) {
  return db?._normalizedKeysOnRead instanceof Set && db._normalizedKeysOnRead.has(collection);
}

function syncCollectionPersistence(collection, previousEntities, nextEntities) {
  upsertEntities(collection, nextEntities);

  const nextIds = new Set(
    nextEntities
      .filter((entity) => entity && typeof entity.id === "string" && entity.id.length > 0)
      .map((entity) => entity.id)
  );

  for (const entity of previousEntities) {
    if (!entity || typeof entity.id !== "string" || entity.id.length === 0) continue;
    if (!nextIds.has(entity.id)) {
      deleteEntity(collection, entity.id);
    }
  }
}

export async function persistCollectionEntityWrite(db, collection, entity) {
  invalidateDbCache();
  ensureDbShapeForWrite(db);
  try {
    withBusyRetry(() => sqliteWriteGate(() => {
      if (hasCollectionReadNormalization(db, collection)) {
        syncCollectionPersistence(
          collection,
          getStoredCollectionSnapshot(db, collection),
          Array.isArray(db.data?.[collection]) ? db.data[collection] : []
        );
      } else {
        upsertEntity(collection, entity);
      }
    }));
    setDbCache(db.data);
    db._rawDataFromStorage = cloneDbData(db.data);
    db._normalizedKeysOnRead = new Set();
  } catch (err) {
    const { data, rawData, normalizedKeys } = loadSqliteStorageState();
    db.data = data;
    db._rawDataFromStorage = rawData;
    db._normalizedKeysOnRead = new Set(normalizedKeys);
    throw err;
  }
}

export async function persistCollectionEntityDelete(db, collection, id) {
  invalidateDbCache();
  ensureDbShapeForWrite(db);
  try {
    withBusyRetry(() => sqliteWriteGate(() => {
      if (hasCollectionReadNormalization(db, collection)) {
        syncCollectionPersistence(
          collection,
          getStoredCollectionSnapshot(db, collection),
          Array.isArray(db.data?.[collection]) ? db.data[collection] : []
        );
      } else {
        deleteEntity(collection, id);
      }
    }));
    setDbCache(db.data);
    db._rawDataFromStorage = cloneDbData(db.data);
    db._normalizedKeysOnRead = new Set();
  } catch (err) {
    const { data, rawData, normalizedKeys } = loadSqliteStorageState();
    db.data = data;
    db._rawDataFromStorage = rawData;
    db._normalizedKeysOnRead = new Set(normalizedKeys);
    throw err;
  }
}

export async function persistCollectionEntitiesWrite(db, collection, entities) {
  invalidateDbCache();
  ensureDbShapeForWrite(db);
  try {
    withBusyRetry(() => sqliteWriteGate(() => {
      if (hasCollectionReadNormalization(db, collection)) {
        syncCollectionPersistence(
          collection,
          getStoredCollectionSnapshot(db, collection),
          Array.isArray(db.data?.[collection]) ? db.data[collection] : []
        );
      } else {
        upsertEntities(collection, entities);
      }
    }));
    setDbCache(db.data);
    db._rawDataFromStorage = cloneDbData(db.data);
    db._normalizedKeysOnRead = new Set();
  } catch (err) {
    const { data, rawData, normalizedKeys } = loadSqliteStorageState();
    db.data = data;
    db._rawDataFromStorage = rawData;
    db._normalizedKeysOnRead = new Set(normalizedKeys);
    throw err;
  }
}

export async function safeWrite(db) {
  const release = await localMutex.acquire();
  try {
    await persistDbWrite(db);
  } finally {
    release();
  }
}

export async function getDb() {
  if (isCloud) {
    if (!dbInstance) {
      const data = cloneDefaultData();
      dbInstance = createMemoryDb(data);
    }
    return dbInstance;
  }

  await ensureSqliteBootstrap();

  if (!dbInstance) {
    dbInstance = createMemoryDb(cloneDefaultData());
  }

  if (hasFreshDbCache()) {
    dbInstance.data = cloneDbData(dbCache);
    dbInstance._rawDataFromStorage = cloneDbData(dbInstance.data);
    dbInstance._normalizedKeysOnRead = new Set();
    return dbInstance;
  }

  await safeRead(dbInstance);

  if (!dbInstance.data) {
    dbInstance.data = cloneDefaultData();
    await safeWrite(dbInstance);
  }

  setDbCache(dbInstance.data);

  return dbInstance;
}

export async function migrateDbShape() {
  const db = await getDb();
  const { data, changed } = ensureDbShape(db.data);
  db.data = data;
  if (changed) {
    await safeWrite(db);
  }
  return db.data;
}

export function stripHotStateFromConnection(connection) {
  if (!connection || typeof connection !== "object") return connection;
  const cleaned = {};
  for (const [key, value] of Object.entries(connection)) {
    if (isHotStateKey(key)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

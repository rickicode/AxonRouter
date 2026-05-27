import path from 'node:path';
import fs from 'node:fs';
import BetterSqliteDatabase from 'better-sqlite3';
import { HOT_STATE_KEYS } from './hotStateKeys';
import { readSqliteMigrationSql, SQLITE_MIGRATIONS } from './sqliteMigrations';
import { getDataDir } from './dataDir';
import { sqliteWriteGate } from './sqliteWriteGate';

type SQLiteRow = Record<string, unknown>;
export type ProviderHotStateMetadata = {
  version: number;
  updatedAt: string | null;
};

export type ProviderHotStateSnapshot = {
  states: Record<string, Record<string, unknown>>;
  metadata: ProviderHotStateMetadata | null;
};
type SQLiteStatementLike = {
  run: (...args: unknown[]) => unknown;
  get: (...args: unknown[]) => SQLiteRow | undefined;
  all: (...args: unknown[]) => SQLiteRow[];
};
type SQLiteDatabaseLike = {
  pragma: (sql: string, options?: { simple?: boolean }) => unknown;
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SQLiteStatementLike;
  transaction: (callback: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown;
  close: () => unknown;
};
type DatabaseDriver = (new (filePath: string) => SQLiteDatabaseLike) | ((filePath: string) => SQLiteDatabaseLike);

let Database: DatabaseDriver | null = null;

function loadDatabaseDriver(): DatabaseDriver {
  if (Database) return Database;
  Database = NodeSQLiteDatabase;
  return Database;
}

function NodeSQLiteDatabase(filePath: string): SQLiteDatabaseLike {
  return new (BetterSqliteDatabase as unknown as new (filePath: string) => SQLiteDatabaseLike)(filePath);
}

const DB_SQLITE_FILE = path.join(getDataDir(), 'db.sqlite');

let sqliteDb: SQLiteDatabaseLike | null = null;
let _closed = false;
let walCheckpointTimer: ReturnType<typeof setInterval> | null = null;
const DEFAULT_SQLITE_MMAP_SIZE = 1024 * 1024 * 1024;

export function configureSqlitePragmas(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');
  db.pragma(`mmap_size = ${DEFAULT_SQLITE_MMAP_SIZE}`);
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
}

function listMissingMigrationIndexes(db, migration) {
  const requiredIndexes = normalizeRequiredIndexes(migration);

  if (requiredIndexes.length === 0) {
    return [];
  }

  const existingIndexes = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL")
      .all()
      .map((row) => row?.name)
      .filter((name) => typeof name === 'string' && name.length > 0)
  );

  return requiredIndexes
    .map((indexDefinition) => indexDefinition.name)
    .filter((indexName) => !existingIndexes.has(indexName));
}

type RequiredIndexDefinition = {
  name: string;
  sql: string | null;
};

function normalizeRequiredIndexes(migration): RequiredIndexDefinition[] {
  if (!Array.isArray(migration?.requiredIndexes)) {
    return [];
  }

  return migration.requiredIndexes
    .map((indexDefinition): RequiredIndexDefinition | null => {
      if (typeof indexDefinition === 'string' && indexDefinition.length > 0) {
        return { name: indexDefinition, sql: null };
      }
      if (
        indexDefinition &&
        typeof indexDefinition === 'object' &&
        typeof indexDefinition.name === 'string' &&
        indexDefinition.name.length > 0
      ) {
        return {
          name: indexDefinition.name,
          sql: typeof indexDefinition.sql === 'string' && indexDefinition.sql.trim().length > 0
            ? indexDefinition.sql.trim()
            : null,
        };
      }
      return null;
    })
    .filter((indexDefinition): indexDefinition is RequiredIndexDefinition => Boolean(indexDefinition));
}

function repairMigrationIndexes(db, migration, missingIndexes) {
  if (!Array.isArray(missingIndexes) || missingIndexes.length === 0) {
    return;
  }

  const requiredIndexesByName = new Map(
    normalizeRequiredIndexes(migration).map((indexDefinition) => [indexDefinition.name, indexDefinition])
  );

  const repairIndexes = db.transaction(() => {
    for (const indexName of missingIndexes) {
      const indexDefinition = requiredIndexesByName.get(indexName);
      if (!indexDefinition?.sql) {
        throw new Error(
          `SQLite migration ${migration?.version} is missing repair SQL for required index ${indexName}`
        );
      }
      db.exec(indexDefinition.sql);
    }
  });

  repairIndexes();
}

function logSafeError(message, error) {
  console.error(message, {
    name: error?.name,
    code: error?.code,
    message: error?.message,
  });
}

function assertNonEmptyString(value, name) {
  if (!value || typeof value !== 'string') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function sanitizeHotState(state = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(state).filter(([key, value]) => {
      if (value === undefined) return false;
      return HOT_STATE_KEYS.has(key) || key.startsWith('modelLock_');
    })
  );
}

function parseHotStateRow(row: SQLiteRow | undefined) {
  const rawValue = typeof row?.value === 'string' ? row.value : null;
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    const sanitized = sanitizeHotState(parsed);
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  } catch {
    return null;
  }
}

function loadHotStateRows(provider, connectionIds = null) {
  const db = getSqliteDb();
  ensureSchema(db);

  if (Array.isArray(connectionIds)) {
    const validIds = connectionIds.filter((connectionId) => typeof connectionId === 'string' && connectionId.length > 0);
    if (validIds.length === 0) return [];
    const placeholders = validIds.map(() => '?').join(', ');
    return db.prepare(
      `SELECT connection_id, value FROM hot_state WHERE provider = ? AND connection_id IN (${placeholders})`
    ).all(provider, ...validIds);
  }

  return db.prepare('SELECT connection_id, value FROM hot_state WHERE provider = ?').all(provider);
}

export function startPeriodicWalCheckpoint() {
  if (walCheckpointTimer) return;
  walCheckpointTimer = setInterval(() => {
    try {
      sqliteDb?.pragma('wal_checkpoint(PASSIVE)');
    } catch {}
  }, 5 * 60 * 1000);
  walCheckpointTimer.unref();
}

export function stopPeriodicWalCheckpoint() {
  if (walCheckpointTimer) {
    clearInterval(walCheckpointTimer);
    walCheckpointTimer = null;
  }
}

export function getSqliteDb() {
  if (_closed) throw new Error('[DB] Database has been closed — cannot re-open after shutdown');
  if (sqliteDb) return sqliteDb;

  // Ensure data directory exists before opening DB
  const dbDir = path.dirname(DB_SQLITE_FILE);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const Driver = loadDatabaseDriver();
  const db = typeof Driver === 'function' && 'prototype' in Driver && Driver.prototype
    ? new (Driver as new (filePath: string) => SQLiteDatabaseLike)(DB_SQLITE_FILE)
    : (Driver as (filePath: string) => SQLiteDatabaseLike)(DB_SQLITE_FILE);

  configureSqlitePragmas(db);

  sqliteDb = db;
  startPeriodicWalCheckpoint();
  return sqliteDb;
}

let _schemaEnsured = false;

export function ensureSchema(db) {
  if (_schemaEnsured) return;
  sqliteWriteGate(() => {
    if (_schemaEnsured) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);

    const appliedVersions = new Set(
      db.prepare('SELECT version FROM schema_version ORDER BY version ASC').all().map((row) => Number(row.version))
    );

    for (const migration of SQLITE_MIGRATIONS) {
      const version = Number(migration?.version);
      if (!Number.isInteger(version) || version < 1) {
        throw new Error(`Invalid SQLite migration version: ${migration?.version}`);
      }

      const missingIndexes = listMissingMigrationIndexes(db, migration);
      if (appliedVersions.has(version)) {
        repairMigrationIndexes(db, migration, missingIndexes);
        continue;
      }

      const applyMigration = db.transaction(() => {
        db.exec(readSqliteMigrationSql(migration));
        db.prepare('INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)').run(version, Date.now());
      });

      applyMigration();
      appliedVersions.add(version);
    }
    _schemaEnsured = true;
  });
}


const COLLECTION_KEYS = ['providerConnections', 'providerNodes', 'proxyPools', 'combos', 'apiKeys', 'customModels', 'modelComboMappings'];
const SINGLETON_KEYS = ['settings', 'modelAliases', 'mitmAlias', 'opencodeSync', 'runtimeConfig', 'tunnelState', 'pricing', 'disabledModels', 'customSkills', 'syncedAvailableModels'];
const HOT_STATE_METADATA_KEY = 'hotStateMetadata';

function loadHotStateMetadataMap(): Record<string, { version?: unknown; updatedAt?: unknown }> {
  const db = getSqliteDb();
  ensureSchema(db);
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(HOT_STATE_METADATA_KEY);
  if (typeof row?.value !== 'string') return {};

  try {
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, { version?: unknown; updatedAt?: unknown }>)
      : {};
  } catch {
    return {};
  }
}


function nextHotStateMetadataEntry(previous = null) {
  return {
    version: Math.max(0, Number(previous?.version) || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
}

function bumpProviderHotStateMetadata(provider, metadata = null) {
  assertNonEmptyString(provider, 'provider');
  const db = getSqliteDb();
  ensureSchema(db);

  return sqliteWriteGate(() => {
    const bump = db.transaction(() => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(HOT_STATE_METADATA_KEY);
      let allMetadata: Record<string, any> = {};
      if (typeof row?.value === 'string') {
        try { allMetadata = JSON.parse(row.value) || {}; } catch { allMetadata = {}; }
      }
      const nextMetadata = metadata || nextHotStateMetadataEntry(allMetadata[provider]);
      allMetadata[provider] = nextMetadata;
      db.prepare(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
      ).run(HOT_STATE_METADATA_KEY, JSON.stringify(allMetadata), Date.now());
      return nextMetadata;
    });
    return bump();
  });
}

export function markProviderHotStateInvalidated(provider) {
  return bumpProviderHotStateMetadata(provider);
}

export function loadProviderHotStateMetadata(provider): ProviderHotStateMetadata | null {
  assertNonEmptyString(provider, 'provider');
  const metadata = loadHotStateMetadataMap()[provider];
  if (!metadata || typeof metadata !== 'object') return null;
  return {
    version: Math.max(0, Number(metadata.version) || 0),
    updatedAt: typeof metadata.updatedAt === 'string' && metadata.updatedAt.length > 0 ? metadata.updatedAt : null,
  };
}

export function loadProviderHotStateSnapshot(provider): ProviderHotStateSnapshot {
  assertNonEmptyString(provider, 'provider');
  return {
    states: loadProviderHotState(provider),
    metadata: loadProviderHotStateMetadata(provider),
  };
}

export function closeSqliteDb() {
  stopPeriodicWalCheckpoint();
  _closed = true;
  if (sqliteDb) {
    // Checkpoint the WAL into the main DB and truncate the WAL file before
    // closing so it doesn't grow unbounded across restarts. Best-effort —
    // never let a checkpoint failure block process shutdown.
    try {
      sqliteDb.pragma('wal_checkpoint(TRUNCATE)');
    } catch (error) {
      logSafeError('[DB] WAL checkpoint on close failed', error);
    }
    try {
      sqliteDb.close();
    } catch (error) {
      logSafeError('[DB] close failed', error);
    }
    sqliteDb = null;
    _schemaEnsured = false;
  }
}


export function loadCollectionFromSqlite(collection) {
  const db = getSqliteDb();
  ensureSchema(db);
  const rows = db.prepare(
    'SELECT value FROM entities WHERE collection = ? ORDER BY updated_at'
  ).all(collection);

  return rows
    .map((row) => {
      if (typeof row?.value !== 'string') return null;
      try {
        return JSON.parse(row.value);
      } catch {
        console.warn(`[sqliteHelpers] Corrupt JSON in collection "${collection}", skipping row`);
        return null;
      }
    })
    .filter((value) => value !== null);
}

export function loadSingletonFromSqlite(key) {
  const db = getSqliteDb();
  ensureSchema(db);
  const row = db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).get(key);

  if (!row || typeof row.value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    console.warn(`[sqliteHelpers] Corrupt JSON in settings key "${key}", returning null`);
    return null;
  }
}

export function upsertSingleton(key, value) {
  sqliteWriteGate(() => {
    const db = getSqliteDb();
    ensureSchema(db);
    db.prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    ).run(key, JSON.stringify(value), Date.now());
  });
}

export function upsertEntity(collection, entity) {
  if (!collection || typeof collection !== 'string') {
    throw new TypeError('collection must be a non-empty string');
  }

  if (!entity || typeof entity !== 'object') {
    throw new TypeError('entity must be an object');
  }

  if (!entity.id || typeof entity.id !== 'string') {
    throw new TypeError('entity.id must be a non-empty string');
  }

  sqliteWriteGate(() => {
    const db = getSqliteDb();
    ensureSchema(db);
    db.prepare(
      'INSERT OR REPLACE INTO entities (collection, id, value, updated_at) VALUES (?, ?, ?, ?)'
    ).run(collection, entity.id, JSON.stringify(entity), Date.now());
  });
}

export function upsertEntities(collection, entities) {
  if (!collection || typeof collection !== 'string') {
    throw new TypeError('collection must be a non-empty string');
  }

  if (!Array.isArray(entities)) {
    throw new TypeError('entities must be an array');
  }

  sqliteWriteGate(() => {
    const db = getSqliteDb();
    ensureSchema(db);
    const timestamp = Date.now();
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO entities (collection, id, value, updated_at) VALUES (?, ?, ?, ?)'
    );

    const transaction = db.transaction(() => {
      for (const entity of entities) {
        if (!entity || typeof entity !== 'object') {
          throw new TypeError('entity must be an object');
        }

        if (!entity.id || typeof entity.id !== 'string') {
          throw new TypeError('entity.id must be a non-empty string');
        }

        stmt.run(collection, entity.id, JSON.stringify(entity), timestamp);
      }
    });

    transaction();
  });
}

export function deleteEntity(collection, id) {
  if (!collection || typeof collection !== 'string') {
    throw new TypeError('collection must be a non-empty string');
  }

  if (!id || typeof id !== 'string') {
    throw new TypeError('id must be a non-empty string');
  }

  sqliteWriteGate(() => {
    const db = getSqliteDb();
    ensureSchema(db);
    db.prepare('DELETE FROM entities WHERE collection = ? AND id = ?').run(collection, id);
  });
}

export function upsertHotState(provider, connectionId, state) {
  assertNonEmptyString(provider, 'provider');
  assertNonEmptyString(connectionId, 'connectionId');

  const sanitizedState = sanitizeHotState(state);
  if (Object.keys(sanitizedState).length === 0) {
    deleteHotState(provider, connectionId);
    return null;
  }

  return sqliteWriteGate(() => {
    const db = getSqliteDb();
    ensureSchema(db);
    db.prepare(
      'INSERT OR REPLACE INTO hot_state (provider, connection_id, value, updated_at) VALUES (?, ?, ?, ?)'
    ).run(provider, connectionId, JSON.stringify(sanitizedState), Date.now());
    return sanitizedState;
  });
}

export function loadHotStates(provider, connectionIds) {
  assertNonEmptyString(provider, 'provider');
  if (!Array.isArray(connectionIds)) {
    throw new TypeError('connectionIds must be an array');
  }

  const rows = loadHotStateRows(provider, connectionIds);
  const result: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    const parsed = parseHotStateRow(row);
    const connectionId = typeof row?.connection_id === 'string' ? row.connection_id : null;
    if (parsed && connectionId) {
      result[connectionId] = parsed;
    }
  }
  return result;
}

export function loadProviderHotState(provider) {
  assertNonEmptyString(provider, 'provider');

  const rows = loadHotStateRows(provider);
  const result: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    const parsed = parseHotStateRow(row);
    const connectionId = typeof row?.connection_id === 'string' ? row.connection_id : null;
    if (parsed && connectionId) {
      result[connectionId] = parsed;
    }
  }
  return result;
}

export function deleteHotState(provider, connectionId) {
  assertNonEmptyString(provider, 'provider');
  assertNonEmptyString(connectionId, 'connectionId');

  sqliteWriteGate(() => {
    const db = getSqliteDb();
    ensureSchema(db);
    db.prepare('DELETE FROM hot_state WHERE provider = ? AND connection_id = ?').run(provider, connectionId);
  });
}

export function clearHotStateForProvider(provider) {
  assertNonEmptyString(provider, 'provider');

  sqliteWriteGate(() => {
    const db = getSqliteDb();
    ensureSchema(db);
    db.prepare('DELETE FROM hot_state WHERE provider = ?').run(provider);
  });
}

export function rebuildHotStateFromConnections(connections) {
  const db = getSqliteDb();
  ensureSchema(db);
  const list = Array.isArray(connections) ? connections : [];

  sqliteWriteGate(() => {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM hot_state').run();

      const stmt = db.prepare(
        'INSERT OR REPLACE INTO hot_state (provider, connection_id, value, updated_at) VALUES (?, ?, ?, ?)'
      );

      for (const connection of list) {
        if (!connection || typeof connection !== 'object') continue;
        const provider = connection.provider;
        const connectionId = connection.id || connection.connectionId;
        if (!provider || typeof provider !== 'string' || !connectionId || typeof connectionId !== 'string') continue;

        const sanitizedState = sanitizeHotState(connection);
        if (Object.keys(sanitizedState).length > 0) {
          stmt.run(provider, connectionId, JSON.stringify(sanitizedState), Date.now());
        }
      }
    });

    transaction();
  });
}

export { DB_SQLITE_FILE };

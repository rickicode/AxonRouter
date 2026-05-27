import fs from 'node:fs';
import path from 'node:path';

import { getDataDir } from './dataDir';
import {
  getDbSqliteFile,
  closeSqliteDb,
  ensureSchema,
  getSqliteDb,
  loadSingletonFromSqlite,
} from './sqliteHelpers';
import { sqliteWriteGate } from './sqliteWriteGate';

type SQLiteRow = Record<string, unknown>;

const COLLECTION_KEYS = ['providerConnections', 'providerNodes', 'proxyPools', 'combos', 'apiKeys', 'customModels', 'modelComboMappings'];
const SINGLETON_KEYS = ['settings', 'modelAliases', 'mitmAlias', 'opencodeSync', 'runtimeConfig', 'tunnelState', 'pricing', 'disabledModels', 'customSkills', 'syncedAvailableModels'];

let _dbJsonFile: string | undefined;
function getDbJsonFilePath() {
  return _dbJsonFile ??= path.join(getDataDir(), 'db.json');
}

function validateCollectionRecords(data, collectionName) {
  const records = Array.isArray(data?.[collectionName]) ? data[collectionName] : [];
  const valid = [];
  for (const [index, item] of records.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !item.id || typeof item.id !== 'string') {
      console.warn(`[DB] Skipping invalid ${collectionName}[${index}]: missing id`);
      continue;
    }
    valid.push(item);
  }
  data[collectionName] = valid;
}

function validateSqliteImportCollections(data) {
  for (const collectionName of COLLECTION_KEYS) {
    validateCollectionRecords(data, collectionName);
  }
}

function removeSqliteArtifacts() {
  const dbFile = getDbSqliteFile();
  for (const file of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}

export function migrateFromJSON() {
  const options = arguments[0] && typeof arguments[0] === 'object' ? arguments[0] : {};
  const preserveJson = options.preserveJson !== false;

  const jsonExists = fs.existsSync(getDbJsonFilePath());
  const sqliteExists = fs.existsSync(getDbSqliteFile());

  if (!jsonExists || sqliteExists) {
    return { migrated: false };
  }

  console.log('[DB] Starting migration from JSON to SQLite...');

  try {
    let jsonData;
    try {
      jsonData = JSON.parse(fs.readFileSync(getDbJsonFilePath(), 'utf-8'));
    } catch (parseError) {
      // Corrupt JSON - rename and start fresh
      const corruptPath = `${getDbJsonFilePath()}.corrupt.${Date.now()}`;
      console.warn(`[DB] db.json is corrupt, renaming to ${path.basename(corruptPath)} and starting fresh`);
      fs.renameSync(getDbJsonFilePath(), corruptPath);
      return { migrated: false };
    }
    validateSqliteImportCollections(jsonData);

    const db = getSqliteDb();
    ensureSchema(db);

    sqliteWriteGate(() => {
      const transaction = db.transaction(() => {
        const entityStmt = db.prepare(
          'INSERT INTO entities (collection, id, value, updated_at) VALUES (?, ?, ?, ?)'
        );

        for (const collection of COLLECTION_KEYS) {
          const items = jsonData[collection] || [];
          for (const item of items) {
            if (item.id) {
              entityStmt.run(collection, item.id, JSON.stringify(item), Date.now());
            }
          }
        }

        const settingStmt = db.prepare(
          'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
        );

        for (const key of SINGLETON_KEYS) {
          if (jsonData[key] !== undefined) {
            settingStmt.run(key, JSON.stringify(jsonData[key]), Date.now());
          }
        }
      });

      transaction();
    });

    for (const col of COLLECTION_KEYS) {
      const originalCount = (jsonData[col] || []).length;
      const countRow = db.prepare(
        'SELECT COUNT(*) as count FROM entities WHERE collection = ?'
      ).get(col);
      const migratedCount = Number((countRow as SQLiteRow | undefined)?.count) || 0;

      if (originalCount !== migratedCount) {
        throw new Error(`Migration verification failed for ${col}: ${originalCount} -> ${migratedCount}`);
      }
    }

    for (const key of SINGLETON_KEYS) {
      if (jsonData[key] === undefined) continue;
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      const rawValue = typeof (row as SQLiteRow | undefined)?.value === 'string'
        ? ((row as SQLiteRow).value as string)
        : null;
      if (!rawValue || JSON.stringify(JSON.parse(rawValue)) !== JSON.stringify(jsonData[key])) {
        throw new Error(`Migration verification failed for singleton ${key}`);
      }
    }

    if (!preserveJson) {
      fs.renameSync(getDbJsonFilePath(), `${getDbJsonFilePath()}.backup`);
    }

    console.log('[DB] Migration completed successfully');
    if (preserveJson) {
      console.log('[DB] JSON source preserved by migration option');
    }

    return { migrated: true };
  } catch (error) {
    console.error('[DB] Migration failed', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });

    closeSqliteDb();
    removeSqliteArtifacts();

    throw new Error(`Migration failed: ${error.message}`);
  }
}

export function loadAllDataFromSqlite() {
  const db = getSqliteDb();
  ensureSchema(db);
  const data: Record<string, unknown> = {};

  for (const collection of COLLECTION_KEYS) {
    const rows = db.prepare(
      'SELECT value FROM entities WHERE collection = ? ORDER BY updated_at'
    ).all(collection);

    data[collection] = rows
      .map((row) => (typeof row?.value === 'string' ? JSON.parse(row.value) : null))
      .filter((value) => value !== null);
  }

  for (const key of SINGLETON_KEYS) {
    const row = db.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).get(key);

    if (typeof row?.value === 'string') data[key] = JSON.parse(row.value);
  }

  return data;
}

export function saveAllDataToSqlite(data) {
  validateSqliteImportCollections(data);

  const db = getSqliteDb();
  ensureSchema(db);

  sqliteWriteGate(() => {
    const transaction = db.transaction(() => {
      for (const collection of COLLECTION_KEYS) {
        const items = data[collection] || [];
        const ids = items.map(item => item.id).filter(Boolean);
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          db.prepare(
            `DELETE FROM entities WHERE collection = ? AND id NOT IN (${placeholders})`
          ).run(collection, ...ids);
        } else {
          db.prepare('DELETE FROM entities WHERE collection = ?').run(collection);
        }

        const stmt = db.prepare(
          'INSERT OR REPLACE INTO entities (collection, id, value, updated_at) VALUES (?, ?, ?, ?)'
        );

        for (const item of items) {
          if (item.id) {
            stmt.run(collection, item.id, JSON.stringify(item), Date.now());
          }
        }
      }

      const stmt = db.prepare(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
      );

      for (const key of SINGLETON_KEYS) {
        if (data[key] !== undefined) {
          stmt.run(key, JSON.stringify(data[key]), Date.now());
        } else {
          db.prepare('DELETE FROM settings WHERE key = ?').run(key);
        }
      }
    });

    transaction();
  });
}

export { loadSingletonFromSqlite };

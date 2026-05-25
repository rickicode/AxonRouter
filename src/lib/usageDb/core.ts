import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DATA_DIR } from "../dataDir";
import { ensureUsageSchema } from "./bootstrap";

const nodeRequire = createRequire(import.meta.url);
const DEFAULT_SQLITE_MMAP_SIZE = 256 * 1024 * 1024;
const USAGE_DB_SQLITE_FILE = path.join(DATA_DIR, "usage.sqlite");

type SQLiteStatementLike = {
  run: (...args: unknown[]) => unknown;
  get: (...args: unknown[]) => unknown;
  all: (...args: unknown[]) => unknown;
};

type SQLiteDatabaseLike = {
  pragma: (sql: string, options?: { simple?: boolean }) => unknown;
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SQLiteStatementLike;
  transaction: <T extends (...args: any[]) => any>(callback: T) => T;
  close: () => unknown;
};

type DatabaseDriver = new (filePath: string) => SQLiteDatabaseLike;

let Database: DatabaseDriver | null = null;
let usageDb: SQLiteDatabaseLike | null = null;
let usageWalCheckpointTimer: ReturnType<typeof setInterval> | null = null;

function loadDatabaseDriver(): DatabaseDriver {
  if (Database) return Database;
  Database = NodeSQLiteDatabase;
  return Database;
}

const NodeSQLiteDatabase: DatabaseDriver = function NodeSQLiteDatabase(filePath: string) {
  const BetterSqliteDatabase = nodeRequire("better-sqlite3");
  return new BetterSqliteDatabase(filePath) as SQLiteDatabaseLike;
} as unknown as DatabaseDriver;

export function getUsageSqliteFile() {
  return USAGE_DB_SQLITE_FILE;
}

export function ensureUsageDbDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function configureUsageSqlitePragmas(db: SQLiteDatabaseLike) {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -32000");
  db.pragma("temp_store = MEMORY");
  db.pragma(`mmap_size = ${DEFAULT_SQLITE_MMAP_SIZE}`);
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
}

export function startUsageWalCheckpoint() {
  if (usageWalCheckpointTimer) return;
  usageWalCheckpointTimer = setInterval(() => {
    try {
      usageDb?.pragma('wal_checkpoint(PASSIVE)');
    } catch {}
  }, 5 * 60 * 1000);
  usageWalCheckpointTimer.unref();
}

export function stopUsageWalCheckpoint() {
  if (usageWalCheckpointTimer) {
    clearInterval(usageWalCheckpointTimer);
    usageWalCheckpointTimer = null;
  }
}

export function getUsageDbInstance() {
  if (usageDb) return usageDb;

  ensureUsageDbDir();
  const Driver = loadDatabaseDriver();
  const db = new Driver(USAGE_DB_SQLITE_FILE);
  configureUsageSqlitePragmas(db);
  usageDb = db;
  startUsageWalCheckpoint();
  return usageDb;
}

export function prepareUsageStatement(sql: string) {
  const db = getUsageDbInstance();
  ensureUsageSchema(db);
  return db.prepare(sql);
}

export function withUsageTransaction<T extends (...args: any[]) => any>(callback: T) {
  const db = getUsageDbInstance();
  ensureUsageSchema(db);
  return db.transaction(callback);
}

let _usageSchemaEnsured = false;

export function getUsageSchemaEnsured() { return _usageSchemaEnsured; }
export function setUsageSchemaEnsured(v: boolean) { _usageSchemaEnsured = v; }

export function closeUsageDb() {
  stopUsageWalCheckpoint();
  if (!usageDb) return;
  usageDb.close();
  usageDb = null;
  _usageSchemaEnsured = false;
}

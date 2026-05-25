import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DATA_DIR } from "../dataDir";

const nodeRequire = createRequire(import.meta.url);
const REQUEST_DETAILS_DB_SQLITE_FILE = path.join(DATA_DIR, "request-details.sqlite");
const DEFAULT_SQLITE_MMAP_SIZE = 128 * 1024 * 1024;

type SQLiteStatementLike = {
  run: (...args: any[]) => any;
  get: (...args: any[]) => any;
  all: (...args: any[]) => any;
};

type SQLiteDatabaseLike = {
  pragma: (sql: string, options?: { simple?: boolean }) => any;
  exec: (sql: string) => any;
  prepare: (sql: string) => SQLiteStatementLike;
  transaction: (callback: (...args: any[]) => any) => (...args: any[]) => any;
  close: () => any;
};

type DatabaseDriver = (filePath: string) => SQLiteDatabaseLike;

let Database: DatabaseDriver | null = null;
let requestDetailsDb: SQLiteDatabaseLike | null = null;

function loadDatabaseDriver(): DatabaseDriver {
  if (Database) return Database;
  Database = NodeSQLiteDatabase;
  return Database;
}

function NodeSQLiteDatabase(filePath: string) {
  const BetterSqliteDatabase = nodeRequire("better-sqlite3");
  return new BetterSqliteDatabase(filePath);
}

export function ensureRequestDetailsDbDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function configureRequestDetailsSqlitePragmas(db: SQLiteDatabaseLike) {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -16000");
  db.pragma("temp_store = MEMORY");
  db.pragma(`mmap_size = ${DEFAULT_SQLITE_MMAP_SIZE}`);
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
}

export function getRequestDetailsSqliteFile() {
  return REQUEST_DETAILS_DB_SQLITE_FILE;
}

export function getRequestDetailsDbInstance() {
  if (requestDetailsDb) return requestDetailsDb;
  ensureRequestDetailsDbDir();
  const Driver = loadDatabaseDriver();
  const db = Driver(REQUEST_DETAILS_DB_SQLITE_FILE);
  configureRequestDetailsSqlitePragmas(db);
  requestDetailsDb = db;
  return requestDetailsDb;
}

export function prepareRequestDetailsStatement(sql) {
  return getRequestDetailsDbInstance().prepare(sql);
}

export function closeRequestDetailsDb() {
  if (!requestDetailsDb) return;
  requestDetailsDb.close();
  requestDetailsDb = null;
}

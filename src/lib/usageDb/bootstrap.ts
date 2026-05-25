import { getUsageDbInstance, getUsageSchemaEnsured, setUsageSchemaEnsured } from "./core";
import {
  LATEST_USAGE_SQLITE_SCHEMA_VERSION,
  readUsageSqliteMigrationSql,
  USAGE_SQLITE_MIGRATIONS,
} from "./migrations";

function getExistingIndexes(db) {
  const rows: any[] = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL").all() as any[];
  return new Set(
    rows
      .map((row) => row?.name)
      .filter((name) => typeof name === "string" && name.length > 0)
  );
}

function getExistingTables(db) {
  const rows: any[] = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IS NOT NULL").all() as any[];
  return new Set(
    rows
      .map((row) => row?.name)
      .filter((name) => typeof name === "string" && name.length > 0)
  );
}

function getExistingColumns(db, tableName) {
  const rows: any[] = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
  return new Set(
    rows
      .map((row) => row?.name)
      .filter((name) => typeof name === "string" && name.length > 0)
  );
}

function ensureUsageMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);
}

function repairUsageIndexes(db, migration) {
  const requiredIndexes = Array.isArray(migration?.requiredIndexes) ? migration.requiredIndexes : [];
  if (requiredIndexes.length === 0) return;

  const existingIndexes = getExistingIndexes(db);
  const sql = readUsageSqliteMigrationSql(migration);

  for (const indexName of requiredIndexes) {
    if (existingIndexes.has(indexName)) continue;
    if (!sql.includes(indexName)) {
      throw new Error(`Usage SQLite migration ${migration?.version} is missing index SQL for ${indexName}`);
    }
    db.exec(sql);
    return repairUsageIndexes(db, migration);
  }
}

function hasRequiredTables(db, migration) {
  const requiredTables = Array.isArray(migration?.requiredTables) ? migration.requiredTables : [];
  if (requiredTables.length === 0) return true;

  const existingTables = getExistingTables(db);
  return requiredTables.every((tableName) => existingTables.has(tableName));
}

function hasRequiredColumns(db, migration) {
  const requiredColumns = migration?.requiredColumns;
  if (!requiredColumns || typeof requiredColumns !== "object") return true;

  return Object.entries(requiredColumns).every(([tableName, columns]) => {
    if (!Array.isArray(columns) || columns.length === 0) return true;
    const existingColumns = getExistingColumns(db, tableName);
    return columns.every((columnName) => existingColumns.has(columnName));
  });
}

function migrationStateMatchesSchema(db, migration) {
  return hasRequiredTables(db, migration) && hasRequiredColumns(db, migration);
}

function reapplyUsageMigration(db, migration, version) {
  db.exec(readUsageSqliteMigrationSql(migration));
  db.prepare("INSERT OR IGNORE INTO usage_migrations(version) VALUES (?)").run(version);
}

export function ensureUsageSchema(db = getUsageDbInstance()) {
  if (getUsageSchemaEnsured()) return { version: LATEST_USAGE_SQLITE_SCHEMA_VERSION, file: "usage.sqlite" };
  ensureUsageMigrationTable(db);

  const appliedVersionRows: any[] = db.prepare("SELECT version FROM usage_migrations ORDER BY version ASC").all() as any[];
  const appliedVersions = new Set(
    appliedVersionRows
      .map((row) => Number(row?.version))
      .filter((version) => Number.isInteger(version) && version > 0)
  );

  for (const migration of USAGE_SQLITE_MIGRATIONS) {
    const version = Number(migration?.version);
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(`Invalid usage SQLite migration version: ${migration?.version}`);
    }

    const applyMigration = db.transaction(() => {
      reapplyUsageMigration(db, migration, version);
    });

    if (appliedVersions.has(version) && migrationStateMatchesSchema(db, migration)) {
      repairUsageIndexes(db, migration);
      continue;
    }

    applyMigration();
    appliedVersions.add(version);
    repairUsageIndexes(db, migration);
  }

  setUsageSchemaEnsured(true);
  return {
    version: LATEST_USAGE_SQLITE_SCHEMA_VERSION,
    file: "usage.sqlite",
  };
}

export async function bootstrapUsageDb() {
  const db = getUsageDbInstance();
  ensureUsageSchema(db);
  cleanupOldUsageData(db);
  return { version: LATEST_USAGE_SQLITE_SCHEMA_VERSION, file: "usage.sqlite" };
}

const RETENTION_DAYS_EVENTS = 90;
const RETENTION_DAYS_LOGS = 30;
const RETENTION_DAYS_SUMMARY = 365;

function cleanupOldUsageData(db) {
  const eventsThreshold = Date.now() - RETENTION_DAYS_EVENTS * 86400000;
  const logsThreshold = Date.now() - RETENTION_DAYS_LOGS * 86400000;
  const summaryThreshold = new Date(Date.now() - RETENTION_DAYS_SUMMARY * 86400000).toISOString().slice(0, 10);

  for (const [sql, param] of [
    ["DELETE FROM usage_events WHERE timestamp < ?", eventsThreshold],
    ["DELETE FROM usage_request_logs WHERE timestamp < ?", logsThreshold],
    ["DELETE FROM usage_daily_summary WHERE date < ?", summaryThreshold],
  ] as [string, number | string][]) {
    try { db.prepare(sql).run(param); } catch (e) {
      console.warn("[UsageDB] Cleanup skipped:", e?.message);
    }
  }
  try { db.exec("PRAGMA optimize"); } catch { /* non-fatal */ }
}

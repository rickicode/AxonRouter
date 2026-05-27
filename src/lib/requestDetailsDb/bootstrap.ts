import fs from "node:fs";
import { resolveDataPath } from "../dataDir";
import { getRequestDetailsDbInstance } from "./core";
import {
  LATEST_REQUEST_DETAILS_SQLITE_SCHEMA_VERSION,
  readRequestDetailsMigrationSql,
  REQUEST_DETAILS_SQLITE_MIGRATIONS,
} from "./migrations";

let _requestDetailsPayloadDir: string | undefined;
function getRequestDetailsPayloadDir() {
  return _requestDetailsPayloadDir ??= resolveDataPath("request-details");
}

function ensureRequestDetailsMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_details_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);
}

export function ensureRequestDetailsSchema(db = getRequestDetailsDbInstance()) {
  ensureRequestDetailsMigrationTable(db);

  const appliedVersions = new Set(
    db.prepare("SELECT version FROM request_details_migrations ORDER BY version ASC")
      .all()
      .map((row) => Number(row.version))
      .filter((version) => Number.isInteger(version) && version > 0)
  );

  for (const migration of REQUEST_DETAILS_SQLITE_MIGRATIONS) {
    const version = Number(migration?.version);
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(`Invalid request details migration version: ${migration?.version}`);
    }

    if (appliedVersions.has(version)) continue;

    const applyMigration = db.transaction(() => {
      db.exec(readRequestDetailsMigrationSql(migration));
      db.prepare("INSERT INTO request_details_migrations(version) VALUES (?)").run(version);
    });

    applyMigration();
  }

  if (!fs.existsSync(getRequestDetailsPayloadDir())) {
    fs.mkdirSync(getRequestDetailsPayloadDir(), { recursive: true });
  }

  return {
    version: LATEST_REQUEST_DETAILS_SQLITE_SCHEMA_VERSION,
    file: "request-details.sqlite",
    payloadDir: getRequestDetailsPayloadDir(),
  };
}

export function bootstrapRequestDetailsDb() {
  const db = getRequestDetailsDbInstance();
  return ensureRequestDetailsSchema(db);
}

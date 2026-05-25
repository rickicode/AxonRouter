import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema");

export const REQUEST_DETAILS_SQLITE_MIGRATIONS = [
  {
    version: 1,
    name: "initial_request_details_schema",
    path: path.join(MIGRATIONS_DIR, "001_initial.sql"),
  },
  {
    version: 2,
    name: "trace_index_columns",
    path: path.join(MIGRATIONS_DIR, "002_trace_index_columns.sql"),
  },
];

export const LATEST_REQUEST_DETAILS_SQLITE_SCHEMA_VERSION = REQUEST_DETAILS_SQLITE_MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, Number(migration?.version) || 0),
  0
);

export function readRequestDetailsMigrationSql(migration) {
  return fs.readFileSync(migration.path, "utf-8");
}

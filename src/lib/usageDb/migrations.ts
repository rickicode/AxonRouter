import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema");

export const USAGE_SQLITE_MIGRATIONS = [
  {
    version: 1,
    name: "initial_usage_schema",
    path: path.join(MIGRATIONS_DIR, "001_initial.sql"),
    requiredIndexes: [
      "idx_usage_events_timestamp",
      "idx_usage_events_provider_timestamp",
      "idx_usage_events_model_timestamp",
      "idx_usage_events_connection_timestamp",
      "idx_usage_events_api_key_timestamp",
      "idx_usage_events_source_timestamp",
      "idx_usage_events_status_timestamp",
      "idx_usage_daily_summary_date",
      "idx_usage_daily_summary_provider_date",
      "idx_usage_daily_summary_model_date",
      "idx_usage_daily_summary_connection_date",
      "idx_usage_daily_summary_api_key_date",
      "idx_usage_daily_summary_source_date",
      "idx_usage_request_logs_timestamp",
      "idx_usage_request_logs_status_timestamp",
      "idx_usage_request_logs_request_id",
    ],
  },
  {
    version: 2,
    name: "usage_events_total_tokens",
    path: path.join(MIGRATIONS_DIR, "002_usage_events_total_tokens.sql"),
    requiredIndexes: [],
  },
];

export const LATEST_USAGE_SQLITE_SCHEMA_VERSION = USAGE_SQLITE_MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, Number(migration?.version) || 0),
  0
);

export function readUsageSqliteMigrationSql(migration) {
  return fs.readFileSync(migration.path, "utf-8");
}

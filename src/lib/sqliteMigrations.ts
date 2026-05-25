const INITIAL_SCHEMA_SQL = `-- Granular entity storage for collections
CREATE TABLE IF NOT EXISTS entities (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (collection, id)
);

CREATE INDEX IF NOT EXISTS idx_entities_collection ON entities(collection);
CREATE INDEX IF NOT EXISTS idx_entities_updated_at ON entities(updated_at);

-- Settings and singleton data
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Provider hot state storage
CREATE TABLE IF NOT EXISTS hot_state (
  provider TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (provider, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_hot_state_provider ON hot_state(provider);
CREATE INDEX IF NOT EXISTS idx_hot_state_updated_at ON hot_state(updated_at);

-- Migration tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);
`;

export const SQLITE_MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    sql: INITIAL_SCHEMA_SQL,
    requiredIndexes: [
      {
        name: 'idx_entities_collection',
        sql: 'CREATE INDEX IF NOT EXISTS idx_entities_collection ON entities(collection)',
      },
      {
        name: 'idx_entities_updated_at',
        sql: 'CREATE INDEX IF NOT EXISTS idx_entities_updated_at ON entities(updated_at)',
      },
      {
        name: 'idx_hot_state_provider',
        sql: 'CREATE INDEX IF NOT EXISTS idx_hot_state_provider ON hot_state(provider)',
      },
      {
        name: 'idx_hot_state_updated_at',
        sql: 'CREATE INDEX IF NOT EXISTS idx_hot_state_updated_at ON hot_state(updated_at)',
      },
    ],
  },
];

export const LATEST_SQLITE_SCHEMA_VERSION = SQLITE_MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, Number(migration?.version) || 0),
  0
);

export function readSqliteMigrationSql(migration) {
  return typeof migration?.sql === 'string' ? migration.sql : '';
}

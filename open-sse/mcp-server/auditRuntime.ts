type SqliteHelpersModule = typeof import("../../src/lib/sqliteHelpers");

let sqliteHelpersPromise: Promise<SqliteHelpersModule> | null = null;

async function loadSqliteHelpers(): Promise<SqliteHelpersModule> {
  if (!sqliteHelpersPromise) {
    sqliteHelpersPromise = import("../../src/lib/sqliteHelpers");
  }
  return sqliteHelpersPromise;
}

export async function initAuditDb() {
  const { getSqliteDb, ensureSchema } = await loadSqliteHelpers();
  const db = getSqliteDb();
  ensureSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_tool_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      output_summary TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      api_key_id TEXT,
      transport TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      error_code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_tool_audit_created_at ON mcp_tool_audit(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mcp_tool_audit_tool_name ON mcp_tool_audit(tool_name);
  `);
  return db;
}

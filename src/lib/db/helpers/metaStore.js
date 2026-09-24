export async function getMeta(db, key, fallback = null) {
  const row = await db.get("SELECT value FROM _meta WHERE key = $1", [key]);
  return row ? row.value : fallback;
}

export async function setMeta(db, key, value) {
  await db.run(
    `INSERT INTO _meta(key, value)
     VALUES($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)],
  );
}

// Sync versions retained for legacy compatibility, migrated to async PostgreSQL calls.
export async function getMetaSync(adapter, key, fallback = null) {
  const row = await adapter.get("SELECT value FROM _meta WHERE key = $1", [key]);
  return row ? row.value : fallback;
}

export async function setMetaSync(adapter, key, value) {
  await adapter.run(
    `INSERT INTO _meta(key, value) VALUES($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)],
  );
}

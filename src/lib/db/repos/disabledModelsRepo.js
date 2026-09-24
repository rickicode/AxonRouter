import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";

const SCOPE = "disabledModels";

export async function getDisabledModels() {
  const db = await getAdapter();
  const rows = await db.all("SELECT key, value FROM kv WHERE scope = $1", [SCOPE]);
  const result = {};
  for (const row of rows) result[row.key] = parseJson(row.value, []);
  return result;
}

export async function getDisabledByProvider(providerAlias) {
  const db = await getAdapter();
  const row = await db.get(
    "SELECT value FROM kv WHERE scope = $1 AND key = $2",
    [SCOPE, providerAlias],
  );
  return row ? parseJson(row.value, []) || [] : [];
}

export async function disableModels(providerAlias, ids) {
  if (!providerAlias || !Array.isArray(ids)) return;
  const db = await getAdapter();

  await db.transaction(async (tx) => {
    const row = await tx.get(
      "SELECT value FROM kv WHERE scope = $1 AND key = $2",
      [SCOPE, providerAlias],
    );
    const current = row ? parseJson(row.value, []) || [] : [];
    const merged = [...new Set([...current, ...ids])];
    await tx.run(
      `INSERT INTO kv(scope, key, value)
       VALUES($1, $2, $3)
       ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
      [SCOPE, providerAlias, merged],
    );
  });
}

export async function enableModels(providerAlias, ids) {
  if (!providerAlias) return;
  const db = await getAdapter();

  await db.transaction(async (tx) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      await tx.run("DELETE FROM kv WHERE scope = $1 AND key = $2", [SCOPE, providerAlias]);
      return;
    }

    const row = await tx.get(
      "SELECT value FROM kv WHERE scope = $1 AND key = $2",
      [SCOPE, providerAlias],
    );
    const current = row ? parseJson(row.value, []) || [] : [];
    const removeSet = new Set(ids);
    const next = current.filter((id) => !removeSet.has(id));

    if (next.length === 0) {
      await tx.run("DELETE FROM kv WHERE scope = $1 AND key = $2", [SCOPE, providerAlias]);
    } else {
      await tx.run(
        `INSERT INTO kv(scope, key, value)
         VALUES($1, $2, $3)
         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [SCOPE, providerAlias, next],
      );
    }
  });
}

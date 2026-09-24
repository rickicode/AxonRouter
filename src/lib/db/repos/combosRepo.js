import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";

function rowToCombo(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    models: parseJson(row.models, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCombos() {
  const db = await getAdapter();
  const rows = await db.all("SELECT * FROM combos ORDER BY created_at ASC");
  return rows.map(rowToCombo);
}

export async function getComboById(id) {
  const db = await getAdapter();
  const row = await db.get("SELECT * FROM combos WHERE id = $1", [id]);
  return rowToCombo(row);
}

export async function getComboByName(name) {
  const db = await getAdapter();
  const row = await db.get("SELECT * FROM combos WHERE name = $1", [name]);
  return rowToCombo(row);
}

export async function createCombo(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const combo = {
    id: data.id || uuidv4(),
    name: data.name,
    kind: data.kind || null,
    models: data.models || [],
    createdAt: now,
    updatedAt: now,
  };

  await db.run(
    `INSERT INTO combos(id, name, kind, models, created_at, updated_at)
     VALUES($1, $2, $3, $4::jsonb, $5, $6)`,
    [combo.id, combo.name, combo.kind, combo.models || [], combo.createdAt, combo.updatedAt],
  );
  return combo;
}

export async function updateCombo(id, data) {
  const db = await getAdapter();
  let result = null;

  await db.transaction(async (tx) => {
    const row = await tx.get("SELECT * FROM combos WHERE id = $1", [id]);
    if (!row) return;

    const merged = { ...rowToCombo(row), ...data, updatedAt: new Date().toISOString() };
    await tx.run(
      `UPDATE combos
       SET name = $1, kind = $2, models = $3::jsonb, updated_at = $4
       WHERE id = $5`,
      [merged.name, merged.kind ?? null, merged.models || [], merged.updatedAt, id],
    );
    result = merged;
  });

  return result;
}

export async function deleteCombo(id) {
  const db = await getAdapter();
  const result = await db.run("DELETE FROM combos WHERE id = $1", [id]);
  return (result?.changes ?? 0) > 0;
}

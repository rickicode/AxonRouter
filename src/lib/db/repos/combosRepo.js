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
    contextWindow: row.context_window !== undefined && row.context_window !== null ? Number(row.context_window) : 250000,
    maxTokens: row.max_tokens !== undefined && row.max_tokens !== null ? Number(row.max_tokens) : 32768,
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
    contextWindow: Number(data.contextWindow ?? data.context_window) || 250000,
    maxTokens: Number(data.maxTokens ?? data.max_tokens) || 32768,
    createdAt: now,
    updatedAt: now,
  };

  await db.run(
    `INSERT INTO combos(id, name, kind, models, context_window, max_tokens, created_at, updated_at)
     VALUES($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
    [combo.id, combo.name, combo.kind, combo.models || [], combo.contextWindow, combo.maxTokens, combo.createdAt, combo.updatedAt],
  );
  return combo;
}

export async function updateCombo(id, data) {
  const db = await getAdapter();
  let result = null;

  await db.transaction(async (tx) => {
    const row = await tx.get("SELECT * FROM combos WHERE id = $1", [id]);
    if (!row) return;

    const existing = rowToCombo(row);
    const merged = {
      ...existing,
      ...data,
      contextWindow: data.contextWindow !== undefined ? (Number(data.contextWindow) || 250000)
        : data.context_window !== undefined ? (Number(data.context_window) || 250000)
        : existing.contextWindow,
      maxTokens: data.maxTokens !== undefined ? (Number(data.maxTokens) || 32768)
        : data.max_tokens !== undefined ? (Number(data.max_tokens) || 32768)
        : existing.maxTokens,
      updatedAt: new Date().toISOString(),
    };
    await tx.run(
      `UPDATE combos
       SET name = $1, kind = $2, models = $3::jsonb, context_window = $4, max_tokens = $5, updated_at = $6
       WHERE id = $7`,
      [merged.name, merged.kind ?? null, merged.models || [], merged.contextWindow, merged.maxTokens, merged.updatedAt, id],
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

import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";

function rowToNode(row) {
  if (!row) return null;
  const extra = parseJson(row.data, {});
  return {
    ...extra,
    id: row.id,
    type: row.type,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nodeToRow(node) {
  const { id, type, name, createdAt, updatedAt, ...rest } = node;
  return {
    id,
    type: type ?? null,
    name: name ?? null,
    data: rest,
    createdAt,
    updatedAt,
  };
}

async function upsert(db, node) {
  const row = nodeToRow(node);
  await db.run(
    `INSERT INTO provider_nodes(id, type, name, data, created_at, updated_at)
     VALUES($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       name = excluded.name,
       data = excluded.data,
       updated_at = excluded.updated_at`,
    [row.id, row.type, row.name, row.data, row.createdAt, row.updatedAt],
  );
}

export async function getProviderNodes(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];

  if (filter.type) {
    where.push(`type = $${params.length + 1}`);
    params.push(filter.type);
  }

  const sql = `SELECT * FROM provider_nodes${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  const rows = await db.all(sql, params);
  return rows.map(rowToNode);
}

export async function getProviderNodeById(id) {
  const db = await getAdapter();
  const row = await db.get("SELECT * FROM provider_nodes WHERE id = $1", [id]);
  return rowToNode(row);
}

export async function createProviderNode(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const node = {
    ...data,
    id: data.id || uuidv4(),
    type: data.type,
    name: data.name,
    createdAt: now,
    updatedAt: now,
  };

  await upsert(db, node);
  return node;
}

export async function updateProviderNode(id, data) {
  const db = await getAdapter();
  let result = null;

  await db.transaction(async (tx) => {
     const row = await tx.get("SELECT * FROM provider_nodes WHERE id = $1 FOR UPDATE", [id]);
    if (!row) return;

    const merged = { ...rowToNode(row), ...data, updatedAt: new Date().toISOString() };
    await upsert(tx, merged);
    result = merged;
  });

  return result;
}

export async function deleteProviderNode(id) {
  const db = await getAdapter();
  let removed = null;

  await db.transaction(async (tx) => {
     const row = await tx.get("SELECT * FROM provider_nodes WHERE id = $1 FOR UPDATE", [id]);
    if (!row) return;

    removed = rowToNode(row);
    await tx.run("DELETE FROM provider_nodes WHERE id = $1", [id]);
  });

  return removed;
}

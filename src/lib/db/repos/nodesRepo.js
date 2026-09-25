import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";
import { getCatalog, invalidateCatalog } from "@/lib/cache/client.js";

const NODE_CACHE_KEY = "axon:catalog:nodes";

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
  const nodes = await getCatalog(NODE_CACHE_KEY, 300, async () => {
    const db = await getAdapter();
    const rows = await db.all("SELECT * FROM provider_nodes");
    return rows.map(rowToNode);
  });
  if (!filter.type) return nodes;
  return nodes.filter((node) => node.type === filter.type);
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
  invalidateCatalog(NODE_CACHE_KEY).catch(() => {});
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

  invalidateCatalog(NODE_CACHE_KEY).catch(() => {});
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

  invalidateCatalog(NODE_CACHE_KEY).catch(() => {});
  return removed;
}

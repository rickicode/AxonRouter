import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";
export { lockProxyPoolForScope } from "../../network/connectionProxy.js";

const GROUP_CACHE_TTL_MS = 5000;
const groupCache = new Map(); // id/name -> { group, expiresAt }
let allGroupsCache = null;
let allGroupsCacheExpiresAt = 0;

export function invalidateProxyGroupCache(id = null) {
  if (id) {
    groupCache.delete(id);
    for (const [k, v] of groupCache.entries()) {
      if (v?.group?.id === id) groupCache.delete(k);
    }
  } else {
    groupCache.clear();
  }
  allGroupsCache = null;
  allGroupsCacheExpiresAt = 0;
}

function rowToGroup(row) {
  if (!row) return null;
  const data = parseJson(row.data, {});
  return {
    ...data,
    id: row.id,
    name: row.name,
    description: row.description || "",
    isSticky: row.is_sticky === true,
    stickyLimit: Number.isFinite(row.sticky_limit) && row.sticky_limit > 0 ? row.sticky_limit : 3,
    poolIds: parseJson(row.pool_ids, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePatch(data = {}) {
  const patch = {};
  if (data.name !== undefined) patch.name = String(data.name).trim();
  if (data.description !== undefined) patch.description = String(data.description).trim();
  if (data.isSticky !== undefined) patch.isSticky = data.isSticky === true;
  if (data.stickyLimit !== undefined) {
    const num = Number(data.stickyLimit);
    patch.stickyLimit = Number.isFinite(num) && num > 0 ? Math.floor(num) : 3;
  }
  if (data.poolIds !== undefined) {
    patch.poolIds = Array.isArray(data.poolIds) ? [...new Set(data.poolIds.map(String).filter(Boolean))] : [];
  }
  if (data.data && typeof data.data === "object") patch.data = data.data;
  return patch;
}

export async function getProxyGroups() {
  const now = Date.now();
  if (allGroupsCache && now < allGroupsCacheExpiresAt) {
    return allGroupsCache;
  }

  const db = await getAdapter();
  const rows = await db.all(
    `SELECT id, name, description, is_sticky, sticky_limit, pool_ids, data, created_at, updated_at
       FROM proxy_groups
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST`,
  );
  const groups = rows.map(rowToGroup);
  allGroupsCache = groups;
  allGroupsCacheExpiresAt = now + GROUP_CACHE_TTL_MS;
  for (const g of groups) {
    groupCache.set(g.id, { group: g, expiresAt: now + GROUP_CACHE_TTL_MS });
    groupCache.set(g.name.toLowerCase(), { group: g, expiresAt: now + GROUP_CACHE_TTL_MS });
  }
  return groups;
}

export async function getProxyGroupById(id) {
  if (!id) return null;
  const now = Date.now();
  const cached = groupCache.get(id);
  if (cached && now < cached.expiresAt) {
    return cached.group;
  }

  const db = await getAdapter();
  const row = await db.get(
    `SELECT id, name, description, is_sticky, sticky_limit, pool_ids, data, created_at, updated_at
       FROM proxy_groups
      WHERE id = $1`,
    [id],
  );
  const group = rowToGroup(row);
  if (group) {
    groupCache.set(group.id, { group, expiresAt: now + GROUP_CACHE_TTL_MS });
    groupCache.set(group.name.toLowerCase(), { group, expiresAt: now + GROUP_CACHE_TTL_MS });
  }
  return group;
}

export async function getProxyGroupByName(name) {
  if (!name) return null;
  const normalized = String(name).trim().toLowerCase();
  const now = Date.now();
  const cached = groupCache.get(normalized);
  if (cached && now < cached.expiresAt) {
    return cached.group;
  }

  const db = await getAdapter();
  const row = await db.get(
    `SELECT id, name, description, is_sticky, sticky_limit, pool_ids, data, created_at, updated_at
       FROM proxy_groups
      WHERE LOWER(name) = LOWER($1)`,
    [name.trim()],
  );
  const group = rowToGroup(row);
  if (group) {
    groupCache.set(group.id, { group, expiresAt: now + GROUP_CACHE_TTL_MS });
    groupCache.set(normalized, { group, expiresAt: now + GROUP_CACHE_TTL_MS });
  }
  return group;
}

export async function createProxyGroup(data = {}) {
  if (!data.name || !String(data.name).trim()) {
    throw new Error("Group name is required");
  }
  const patch = normalizePatch(data);
  const db = await getAdapter();
  const now = new Date().toISOString();
  const group = {
    id: data.id || uuidv4(),
    name: patch.name,
    description: patch.description || "",
    isSticky: patch.isSticky === true,
    stickyLimit: patch.stickyLimit || 3,
    poolIds: patch.poolIds || [],
    data: patch.data || {},
    createdAt: now,
    updatedAt: now,
  };

  await db.run(
    `INSERT INTO proxy_groups (id, name, description, is_sticky, sticky_limit, pool_ids, data, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
    [
      group.id,
      group.name,
      group.description,
      group.isSticky,
      group.stickyLimit,
      group.poolIds || [],
      group.data || {},
      group.createdAt,
      group.updatedAt,
    ],
  );

  invalidateProxyGroupCache();
  return group;
}

export async function updateProxyGroup(id, data = {}) {
  if (!id) return null;
  const db = await getAdapter();
  const patch = normalizePatch(data);

  const result = await db.transaction(async (tx) => {
     const row = await tx.get(`SELECT * FROM proxy_groups WHERE id = $1 FOR UPDATE`, [id]);
    if (!row) return null;
    const existing = rowToGroup(row);
    const merged = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    await tx.run(
      `UPDATE proxy_groups
          SET name = $2,
              description = $3,
              is_sticky = $4,
              sticky_limit = $5,
              pool_ids = $6::jsonb,
              data = $7::jsonb,
              updated_at = $8
        WHERE id = $1`,
      [
        id,
        merged.name,
        merged.description,
        merged.isSticky,
        merged.stickyLimit,
        merged.poolIds || [],
        merged.data || {},
        merged.updatedAt,
      ],
    );
    return merged;
  });

  invalidateProxyGroupCache(id);
  return result;
}

export async function deleteProxyGroup(id) {
  if (!id) return null;
  const db = await getAdapter();
   const row = await db.transaction(async (tx) => {
     const existing = await tx.get(`SELECT * FROM proxy_groups WHERE id = $1 FOR UPDATE`, [id]);
     if (!existing) return null;
     await tx.run(`DELETE FROM proxy_groups WHERE id = $1`, [id]);
     return existing;
   });
   if (!row) return null;
  invalidateProxyGroupCache(id);
  return rowToGroup(row);
}

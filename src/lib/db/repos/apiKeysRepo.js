import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function booleanValue(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1;
}

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machine_id,
    isActive: booleanValue(row.is_active),
    createdAt: row.created_at,
  };
}

function normalizePatch(data = {}) {
  return {
    ...data,
    machineId: data.machineId ?? data.machine_id,
    isActive: data.isActive ?? data.is_active,
    createdAt: data.createdAt ?? data.created_at,
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = await db.all(
    `SELECT id, key, name, machine_id, is_active, created_at
       FROM api_keys
      ORDER BY created_at ASC`,
  );
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = await db.get(
    `SELECT id, key, name, machine_id, is_active, created_at
       FROM api_keys
      WHERE id = $1`,
    [id],
  );
  return rowToKey(row);
}

export async function createApiKey(name, machineId) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("../../../shared/utils/apiKey.js");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  const row = await db.get(
    `INSERT INTO api_keys (id, key, name, machine_id, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, key, name, machine_id, is_active, created_at`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, apiKey.isActive, apiKey.createdAt],
  );
  return rowToKey(row);
}

export async function updateApiKey(id, data = {}) {
  const db = await getAdapter();
  const patch = normalizePatch(data);
  const row = await db.get(
    `UPDATE api_keys
        SET key = COALESCE($2, key),
            name = COALESCE($3, name),
            machine_id = COALESCE($4, machine_id),
            is_active = COALESCE($5, is_active)
      WHERE id = $1
      RETURNING id, key, name, machine_id, is_active, created_at`,
    [
      id,
      patch.key ?? null,
      patch.name ?? null,
      patch.machineId ?? null,
      patch.isActive === undefined ? null : booleanValue(patch.isActive),
    ],
  );
  return rowToKey(row);
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const result = await db.run(`DELETE FROM api_keys WHERE id = $1`, [id]);
  apiKeyCache.clear();
  return Number(result?.changes ?? 0) > 0;
}

const apiKeyCache = new Map();
const API_KEY_CACHE_TTL_MS = 60000; // 1 min

export async function validateApiKey(key) {
  if (!key) return false;
  const now = Date.now();
  const cached = apiKeyCache.get(key);
  if (cached && now < cached.expiresAt) {
    return cached.isValid;
  }

  const db = await getAdapter();
  const row = await db.get(
    `SELECT is_active FROM api_keys WHERE key = $1`,
    [key],
  );
  const isValid = Boolean(row && booleanValue(row.is_active, false));
  apiKeyCache.set(key, { isValid, expiresAt: now + API_KEY_CACHE_TTL_MS });

  // Simple cap on map size
  if (apiKeyCache.size > 5000) {
    apiKeyCache.clear();
  }

  return isValid;
}

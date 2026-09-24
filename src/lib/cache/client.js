import crypto from "node:crypto";
import { memSet, memGet, memDel, memDelPrefix, memMget, memIncr, memExpire } from "./memoryStore.js";

// ── Memory-first speed layer (single-container) ──────────────────────────
// All fast-path state lives in a process-local Map with TTL (memoryStore.js);
// PG remains the durable source of truth for locks/cooldowns. API is unchanged
// so the 14 importing files need no edits.
//
// Semantics preserved:
// - Every setter is fail-open (returns safe default on error).
// - TTL expiry handles auto-cleanup.
// - acquireLock/releaseLock use owner tokens (single-process mutex).

export function isCacheAvailable() {
  return true;
}

/**
 * Generic raw get/set/del (used by usageSnapshotsRepo quota cache).
 * TTL-aware via memoryStore.
 */
export async function cacheGetRaw(key) {
  if (!key) return null;
  try {
    return memGet(key);
  } catch {
    return null;
  }
}

export async function cacheSetRaw(key, value, ttlSeconds = 60) {
  if (!key) return false;
  try {
    memSet(key, value, ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function cacheDelRaw(key) {
  if (!key) return false;
  try {
    memDel(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fast Cooldown Management (Auto-TTL, Zero DB Cleanup)
 */
export async function setAccountCooldown(connId, cooldownSeconds) {
  if (!connId) return false;
  try {
    if (cooldownSeconds <= 0) {
      memDel(`cooldown:conn:${connId}`);
      memDelPrefix(`cooldown:model:${connId}:`);
      return true;
    }
    memSet(`cooldown:conn:${connId}`, "1", Math.ceil(cooldownSeconds));
    return true;
  } catch {
    return false;
  }
}

export async function isAccountInCooldown(connId) {
  if (!connId) return false;
  try {
    return memGet(`cooldown:conn:${connId}`) === "1";
  } catch {
    return false;
  }
}

export async function setModelCooldown(connId, model, cooldownSeconds) {
  if (!connId || !model) return false;
  try {
    if (cooldownSeconds <= 0) {
      memDel(`cooldown:model:${connId}:${model}`);
      return true;
    }
    memSet(`cooldown:model:${connId}:${model}`, "1", Math.ceil(cooldownSeconds));
    return true;
  } catch {
    return false;
  }
}

export async function clearAccountCooldown(connId) {
  return setAccountCooldown(connId, 0);
}

export async function clearBatchAccountCooldown(connIds) {
  if (!Array.isArray(connIds) || connIds.length === 0) return false;
  try {
    memDel(...connIds.map((id) => `cooldown:conn:${id}`));
    for (const id of connIds) {
      memDelPrefix(`cooldown:model:${id}:`);
    }
    return true;
  } catch {
    return false;
  }
}

export async function clearModelCooldown(connId, model) {
  return setModelCooldown(connId, model, 0);
}

export async function isModelInCooldown(connId, model) {
  try {
    return memGet(`cooldown:model:${connId}:${model}`) === "1";
  } catch {
    return false;
  }
}

/**
 * Consecutive upstream-failure counter per provider/model (combo failover).
 */
export async function incrModelFailCount(member, windowSeconds) {
  if (!member) return 0;
  try {
    const key = `modelfail:${member}`;
    const count = memIncr(key);
    if (count === 1) memExpire(key, Math.max(60, windowSeconds || 900));
    return Number(count);
  } catch {
    return 0;
  }
}

export async function resetModelFailCount(member) {
  if (!member) return false;
  try {
    memDel(`modelfail:${member}`);
    return true;
  } catch {
    return false;
  }
}

export async function setModelFailCount(member, count, windowSeconds = 900) {
  if (!member) return false;
  try {
    const key = `modelfail:${member}`;
    memSet(key, String(count), Math.max(60, windowSeconds || 900));
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomic shared counter (strict round-robin sequence, rate meters, ...).
 */
export async function incrSharedCounter(key, expireSeconds = 2592000) {
  if (!key) return null;
  try {
    const count = memIncr(key);
    if (count === 1) memExpire(key, expireSeconds);
    return Number(count);
  } catch {
    return null;
  }
}

export async function delSharedCounter(key) {
  if (!key) return false;
  try {
    memDel(key);
    return true;
  } catch {
    return false;
  }
}

export async function getModelFailCounts(members) {
  if (!Array.isArray(members) || members.length === 0) return {};
  try {
    const out = {};
    for (const m of members) out[m] = Number(memGet(`modelfail:${m}`) || 0);
    return out;
  } catch {
    return {};
  }
}

/**
 * Last-known-good account per provider+model.
 */
export async function getLkg(provider, model) {
  if (!provider) return null;
  try {
    return memGet(`lkg:${provider}|${model || "*"}`) || null;
  } catch {
    return null;
  }
}

export async function setLkg(provider, model, connectionId, ttlSeconds = 60) {
  if (!provider || !connectionId) return false;
  try {
    memSet(`lkg:${provider}|${model || "*"}`, connectionId, ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function delLkg(provider, model) {
  if (!provider) return false;
  try {
    memDel(`lkg:${provider}|${model || "*"}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Dead provider/model circuit.
 */
export async function incrDeadCircuit(provider, model, windowSeconds = 60) {
  if (!provider) return 0;
  try {
    const key = `deadpm:${provider}|${model || "*"}`;
    const count = memIncr(key);
    if (count === 1) memExpire(key, windowSeconds);
    return count;
  } catch {
    return 0;
  }
}

export async function resetDeadCircuit(provider, model) {
  if (!provider) return false;
  try {
    memDel(`deadpm:${provider}|${model || "*"}`);
    return true;
  } catch {
    return false;
  }
}

export async function getDeadCircuit(provider, model) {
  if (!provider) return 0;
  try {
    return Number(memGet(`deadpm:${provider}|${model || "*"}`) || 0);
  } catch {
    return 0;
  }
}

/**
 * Fleet-wide provider dead tracker: marks a provider as completely unusable
 * when 100% of its accounts are exhausted or unavailable. Combos check this
 * to immediately demote ALL models from this provider to the back.
 */
export async function setProviderDead(provider, ttlSeconds = 60) {
  if (!provider) return false;
  try {
    memSet(`deadprov:${provider}`, "1", Math.max(10, ttlSeconds));
    return true;
  } catch {
    return false;
  }
}

export async function isProviderDead(provider) {
  if (!provider) return false;
  try {
    return memGet(`deadprov:${provider}`) === "1";
  } catch {
    return false;
  }
}

export async function clearProviderDead(provider) {
  if (!provider) return false;
  try {
    memDel(`deadprov:${provider}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * High-performance batch cooldown check.
 * Returns { ids: Set of connection IDs in cooldown, healthy }.
 */
export async function getBatchCooldowns(connIds, model = null) {
  if (!Array.isArray(connIds) || connIds.length === 0) {
    return { ids: new Set(), healthy: true };
  }
  try {
    const keys = [];
    for (const id of connIds) {
      keys.push(`cooldown:conn:${id}`);
      if (model) keys.push(`cooldown:model:${id}:${model}`);
    }
    const values = memMget(keys);
    const cooledDown = new Set();
    const stride = model ? 2 : 1;
    for (let i = 0; i < connIds.length; i++) {
      if (values[i * stride] === "1" || (model && values[i * stride + 1] === "1")) {
        cooledDown.add(connIds[i]);
      }
    }
    return { ids: cooledDown, healthy: true };
  } catch {
    return { ids: new Set(), healthy: false };
  }
}

/**
 * Cache full active connections (L2 speed layer, TTL 10s).
 */
export async function getCachedConnections(provider) {
  if (!provider) return null;
  try {
    const raw = memGet(`cache:connections:${provider}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedConnections(provider, connections, ttlSeconds = 10) {
  if (!provider || !Array.isArray(connections)) return false;
  try {
    memSet(`cache:connections:${provider}`, JSON.stringify(connections), ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function invalidateCachedConnections(provider) {
  if (!provider) return false;
  try {
    // The window scan caches per (provider, model) routing windows too.
    // Iterate instead of prefix-scan: two memDel calls are O(1) map deletes.
    memDel(`cache:connections:${provider}`);
    memDelPrefix(`cache:connections:${provider}::routing:`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Single-process mutex (owner-token compare-and-delete semantics preserved).
 */
const LOCK_PREFIX = "lock:";
if (!global._memLocks) global._memLocks = new Map();

export async function acquireLock(key, ttlSeconds = 30) {
  if (!key) return null;
  try {
    const lockKey = `${LOCK_PREFIX}${key}`;
    if (global._memLocks.has(lockKey)) return null;
    const token = crypto.randomUUID();
    global._memLocks.set(lockKey, token);
    const ms = Math.min(ttlSeconds * 1000, 2 ** 31 - 1);
    const timer = setTimeout(() => global._memLocks.delete(lockKey), ms);
    if (timer?.unref) timer.unref();
    return token;
  } catch {
    return null;
  }
}

export async function releaseLock(key, token) {
  try {
    const lockKey = `${LOCK_PREFIX}${key}`;
    if (token) {
      if (global._memLocks.get(lockKey) === token) global._memLocks.delete(lockKey);
    } else {
      global._memLocks.delete(lockKey);
    }
  } catch {}
}

/**
 * In-Flight Concurrency Limiter per Account
 */
const ACTIVE_REQUEST_TTL_SECONDS = 30;

export async function incrementInFlight(connId) {
  if (!connId) return 1;
  try {
    const count = memIncr(`active_req:${connId}`);
    if (count === 1) memExpire(`active_req:${connId}`, ACTIVE_REQUEST_TTL_SECONDS);
    return count;
  } catch {
    return 1;
  }
}

export async function decrementInFlight(connId) {
  if (!connId) return 0;
  try {
    const raw = Number(memGet(`active_req:${connId}`) || 0);
    const count = Math.max(0, raw - 1);
    if (count <= 0) {
      memDel(`active_req:${connId}`);
      return 0;
    }
    memSet(`active_req:${connId}`, String(count), ACTIVE_REQUEST_TTL_SECONDS);
    return count;
  } catch {
    return 0;
  }
}

export async function registerActiveRequest(requestId, detail) {
  if (!requestId) return false;
  try {
    memSet(
      `active_req:detail:${requestId}`,
      JSON.stringify({ ...detail, requestId, expiresAt: Date.now() + ACTIVE_REQUEST_TTL_SECONDS * 1000 }),
      ACTIVE_REQUEST_TTL_SECONDS
    );
    // O(1) Set index (single-process). The old JSON array re-parse/rewrite
    // was O(n) per request start/stop and churned the store at high concurrency.
    if (!global._activeReqIndex) global._activeReqIndex = new Set();
    global._activeReqIndex.add(requestId);
    return true;
  } catch {
    return false;
  }
}

export async function unregisterActiveRequest(requestId) {
  if (!requestId) return false;
  try {
    memDel(`active_req:detail:${requestId}`);
    global._activeReqIndex?.delete(requestId);
    return true;
  } catch {
    return false;
  }
}

export async function getActiveRequestsDistributed() {
  try {
    const index = global._activeReqIndex;
    if (!index || index.size === 0) return [];
    const now = Date.now();
    const out = [];
    const dead = [];
    for (const id of index) {
      const raw = memGet(`active_req:detail:${id}`);
      if (!raw) { dead.push(id); continue; }
      try {
        const parsed = JSON.parse(raw);
        if (parsed.expiresAt && parsed.expiresAt <= now) { dead.push(id); continue; }
        out.push(parsed);
      } catch { dead.push(id); }
    }
    for (const id of dead) index.delete(id);
    return out;
  } catch {
    return [];
  }
}

/**
 * Cluster Real-Time Pub/Sub — no-op single-process (SSE fan-out is in-process).
 */
export async function publishEvent(channel, payload) {
  void channel;
  void payload;
  return true;
}

/**
 * Quota Snapshot Cache Layer (TTL 120s).
 */
export async function setCachedQuota(connId, quotaData, ttlSeconds = 120) {
  if (!connId) return false;
  try {
    memSet(`quota:snapshot:${connId}`, typeof quotaData === "string" ? quotaData : JSON.stringify(quotaData), ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function getCachedQuota(connId) {
  if (!connId) return null;
  try {
    const raw = memGet(`quota:snapshot:${connId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteCachedQuota(connId) {
  if (!connId) return false;
  try {
    memDel(`quota:snapshot:${connId}`);
    return true;
  } catch {
    return false;
  }
}

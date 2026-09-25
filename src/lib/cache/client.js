import crypto from "node:crypto";
import { memSet, memGet, memDel, memDelPrefix, memMget, memIncr, memExpire } from "./memoryStore.js";
import { getValkey, publishValkey, subscribeValkey, initValkey } from "./valkeyClient.js";

// ── Hybrid Speed Layer: Valkey (Distributed) + MemoryStore (Process-Local) ──
// When Valkey is available (default on 127.0.0.1:6379), state is synchronized
// across all cluster workers and the web dashboard with sub-millisecond latency.
// If Valkey is unavailable, every operation transparently fails open to local memory.

const LOCK_PREFIX = "lock:";
const ACTIVE_REQUEST_TTL_SECONDS = 60;
if (!global._memLocks) global._memLocks = new Map();
if (!global._cooldownSubscribed) global._cooldownSubscribed = false;

// Initialize cross-worker cooldown cache synchronization via Pub/Sub
if (!global._cooldownSubscribed) {
  global._cooldownSubscribed = true;
  subscribeValkey("axon:events:cooldown", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "set_account" && msg.connId) {
        memSet(`cooldown:conn:${msg.connId}`, "1", msg.ttl || 60);
      } else if (msg.type === "clear" && msg.connId) {
        memDel(`cooldown:conn:${msg.connId}`);
        memDelPrefix(`cooldown:model:${msg.connId}:`);
      } else if (msg.type === "set_model" && msg.connId && msg.model) {
        memSet(`cooldown:model:${msg.connId}:${msg.model}`, "1", msg.ttl || 60);
      } else if (msg.type === "clear_model" && msg.connId && msg.model) {
        memDel(`cooldown:model:${msg.connId}:${msg.model}`);
      } else if (msg.type === "clear_batch" && Array.isArray(msg.connIds)) {
        for (const id of msg.connIds) {
          memDel(`cooldown:conn:${id}`);
          memDelPrefix(`cooldown:model:${id}:`);
        }
      }
    } catch {}
  }).catch(() => {});
}

export function isCacheAvailable() {
  return true;
}

/**
 * Generic raw get/set/del.
 */
export async function cacheGetRaw(key) {
  if (!key) return null;
  const valkey = getValkey();
  if (valkey) {
    try {
      const val = await valkey.get(key);
      if (val !== null) return val;
    } catch {}
  }
  try {
    return memGet(key);
  } catch {
    return null;
  }
}

export async function cacheSetRaw(key, value, ttlSeconds = 60) {
  if (!key) return false;
  const valkey = getValkey();
  if (valkey) {
    try {
      await valkey.set(key, value, "EX", Math.max(1, ttlSeconds));
    } catch {}
  }
  try {
    memSet(key, value, ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function cacheDelRaw(key) {
  if (!key) return false;
  const valkey = getValkey();
  if (valkey) {
    try {
      await valkey.del(key);
    } catch {}
  }
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
      const valkey = getValkey();
      if (valkey) {
        valkey.del(`cooldown:conn:${connId}`).catch(() => {});
      }
      memDel(`cooldown:conn:${connId}`);
      memDelPrefix(`cooldown:model:${connId}:`);
      publishValkey("axon:events:cooldown", { type: "clear", connId }).catch(() => {});
      return true;
    }
    const ttl = Math.ceil(cooldownSeconds);
    const valkey = getValkey();
    if (valkey) {
      valkey.set(`cooldown:conn:${connId}`, "1", "EX", ttl).catch(() => {});
    }
    memSet(`cooldown:conn:${connId}`, "1", ttl);
    publishValkey("axon:events:cooldown", { type: "set_account", connId, ttl }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function isAccountInCooldown(connId) {
  if (!connId) return false;
  try {
    if (memGet(`cooldown:conn:${connId}`) === "1") return true;
    const valkey = getValkey();
    if (valkey) {
      const res = await valkey.get(`cooldown:conn:${connId}`);
      if (res === "1") {
        memSet(`cooldown:conn:${connId}`, "1", 30);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function setModelCooldown(connId, model, cooldownSeconds) {
  if (!connId || !model) return false;
  try {
    if (cooldownSeconds <= 0) {
      const valkey = getValkey();
      if (valkey) {
        valkey.del(`cooldown:model:${connId}:${model}`).catch(() => {});
      }
      memDel(`cooldown:model:${connId}:${model}`);
      publishValkey("axon:events:cooldown", { type: "clear_model", connId, model }).catch(() => {});
      return true;
    }
    const ttl = Math.ceil(cooldownSeconds);
    const valkey = getValkey();
    if (valkey) {
      valkey.set(`cooldown:model:${connId}:${model}`, "1", "EX", ttl).catch(() => {});
    }
    memSet(`cooldown:model:${connId}:${model}`, "1", ttl);
    publishValkey("axon:events:cooldown", { type: "set_model", connId, model, ttl }).catch(() => {});
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
    const valkey = getValkey();
    if (valkey) {
      valkey.del(...connIds.map((id) => `cooldown:conn:${id}`)).catch(() => {});
    }
    memDel(...connIds.map((id) => `cooldown:conn:${id}`));
    for (const id of connIds) {
      memDelPrefix(`cooldown:model:${id}:`);
    }
    publishValkey("axon:events:cooldown", { type: "clear_batch", connIds }).catch(() => {});
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
    if (memGet(`cooldown:model:${connId}:${model}`) === "1") return true;
    const valkey = getValkey();
    if (valkey) {
      const res = await valkey.get(`cooldown:model:${connId}:${model}`);
      if (res === "1") {
        memSet(`cooldown:model:${connId}:${model}`, "1", 30);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Consecutive upstream-failure counter per provider/model (combo failover).
 */
export async function incrModelFailCount(member, windowSeconds) {
  if (!member) return 0;
  const key = `modelfail:${member}`;
  const valkey = getValkey();
  if (valkey) {
    try {
      const count = await valkey.incr(key);
      if (count === 1) await valkey.expire(key, Math.max(60, windowSeconds || 900));
      return Number(count);
    } catch {}
  }
  try {
    const count = memIncr(key);
    if (count === 1) memExpire(key, Math.max(60, windowSeconds || 900));
    return Number(count);
  } catch {
    return 0;
  }
}

export async function resetModelFailCount(member) {
  if (!member) return false;
  const key = `modelfail:${member}`;
  const valkey = getValkey();
  if (valkey) {
    valkey.del(key).catch(() => {});
  }
  try {
    memDel(key);
    return true;
  } catch {
    return false;
  }
}

export async function setModelFailCount(member, count, windowSeconds = 900) {
  if (!member) return false;
  const key = `modelfail:${member}`;
  const valkey = getValkey();
  if (valkey) {
    valkey.set(key, String(count), "EX", Math.max(60, windowSeconds || 900)).catch(() => {});
  }
  try {
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
  const valkey = getValkey();
  if (valkey) {
    try {
      const count = await valkey.incr(key);
      if (count === 1) await valkey.expire(key, expireSeconds);
      return Number(count);
    } catch {}
  }
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
  const valkey = getValkey();
  if (valkey) {
    valkey.del(key).catch(() => {});
  }
  try {
    memDel(key);
    return true;
  } catch {
    return false;
  }
}

export async function getModelFailCounts(members) {
  if (!Array.isArray(members) || members.length === 0) return {};
  const valkey = getValkey();
  if (valkey) {
    try {
      const keys = members.map((m) => `modelfail:${m}`);
      const vals = await valkey.mget(...keys);
      const out = {};
      for (let i = 0; i < members.length; i++) {
        out[members[i]] = Number(vals[i] || 0);
      }
      return out;
    } catch {}
  }
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
  const key = `lkg:${provider}|${model || "*"}`;
  const valkey = getValkey();
  if (valkey) {
    try {
      const v = await valkey.get(key);
      if (v) return v;
    } catch {}
  }
  try {
    return memGet(key) || null;
  } catch {
    return null;
  }
}

export async function setLkg(provider, model, connectionId, ttlSeconds = 60) {
  if (!provider || !connectionId) return false;
  const key = `lkg:${provider}|${model || "*"}`;
  const valkey = getValkey();
  if (valkey) {
    valkey.set(key, connectionId, "EX", ttlSeconds).catch(() => {});
  }
  try {
    memSet(key, connectionId, ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function delLkg(provider, model) {
  if (!provider) return false;
  const key = `lkg:${provider}|${model || "*"}`;
  const valkey = getValkey();
  if (valkey) {
    valkey.del(key).catch(() => {});
  }
  try {
    memDel(key);
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
  const key = `deadpm:${provider}|${model || "*"}`;
  const valkey = getValkey();
  if (valkey) {
    try {
      const count = await valkey.incr(key);
      if (count === 1) await valkey.expire(key, windowSeconds);
      return count;
    } catch {}
  }
  try {
    const count = memIncr(key);
    if (count === 1) memExpire(key, windowSeconds);
    return count;
  } catch {
    return 0;
  }
}

export async function resetDeadCircuit(provider, model) {
  if (!provider) return false;
  const key = `deadpm:${provider}|${model || "*"}`;
  const valkey = getValkey();
  if (valkey) {
    valkey.del(key).catch(() => {});
  }
  try {
    memDel(key);
    return true;
  } catch {
    return false;
  }
}

export async function getDeadCircuit(provider, model) {
  if (!provider) return 0;
  const key = `deadpm:${provider}|${model || "*"}`;
  const valkey = getValkey();
  if (valkey) {
    try {
      const v = await valkey.get(key);
      if (v !== null) return Number(v || 0);
    } catch {}
  }
  try {
    return Number(memGet(key) || 0);
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
  const key = `deadprov:${provider}`;
  const ttl = Math.max(10, ttlSeconds);
  const valkey = getValkey();
  if (valkey) {
    valkey.set(key, "1", "EX", ttl).catch(() => {});
  }
  try {
    memSet(key, "1", ttl);
    return true;
  } catch {
    return false;
  }
}

export async function isProviderDead(provider) {
  if (!provider) return false;
  const key = `deadprov:${provider}`;
  const valkey = getValkey();
  if (valkey) {
    try {
      const v = await valkey.get(key);
      if (v !== null) return v === "1";
    } catch {}
  }
  try {
    return memGet(key) === "1";
  } catch {
    return false;
  }
}

export async function clearProviderDead(provider) {
  if (!provider) return false;
  const key = `deadprov:${provider}`;
  const valkey = getValkey();
  if (valkey) {
    valkey.del(key).catch(() => {});
  }
  try {
    memDel(key);
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
  const keys = [];
  for (const id of connIds) {
    keys.push(`cooldown:conn:${id}`);
    if (model) keys.push(`cooldown:model:${id}:${model}`);
  }

  const valkey = getValkey();
  if (valkey) {
    try {
      const values = await valkey.mget(...keys);
      const cooledDown = new Set();
      const stride = model ? 2 : 1;
      for (let i = 0; i < connIds.length; i++) {
        if (values[i * stride] === "1" || (model && values[i * stride + 1] === "1")) {
          cooledDown.add(connIds[i]);
        }
      }
      return { ids: cooledDown, healthy: true };
    } catch {}
  }

  try {
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
  const key = `cache:connections:${provider}`;
  const valkey = getValkey();
  if (valkey) {
    try {
      const raw = await valkey.get(key);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  try {
    const raw = memGet(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedConnections(provider, connections, ttlSeconds = 10) {
  if (!provider || !Array.isArray(connections)) return false;
  const key = `cache:connections:${provider}`;
  const payload = JSON.stringify(connections);
  const valkey = getValkey();
  if (valkey) {
    valkey.set(key, payload, "EX", ttlSeconds).catch(() => {});
  }
  try {
    memSet(key, payload, ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function invalidateCachedConnections(provider) {
  if (!provider) return false;
  const key = `cache:connections:${provider}`;
  const valkey = getValkey();
  if (valkey) {
    valkey.del(key).catch(() => {});
  }
  try {
    memDel(key);
    memDelPrefix(`cache:connections:${provider}::routing:`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Distributed Mutex using Valkey SET NX EX + Lua compare-and-delete.
 * Fails open to process-local mutex if Valkey is unavailable.
 */
export async function acquireLock(key, ttlSeconds = 30) {
  if (!key) return null;
  const token = crypto.randomUUID();
  const valkey = getValkey();
  if (valkey) {
    try {
      const res = await valkey.set(`${LOCK_PREFIX}${key}`, token, "NX", "EX", Math.max(1, Math.ceil(ttlSeconds)));
      if (res === "OK") return token;
      return null;
    } catch {
      // Fall open to memory lock on network error
    }
  }

  try {
    const lockKey = `${LOCK_PREFIX}${key}`;
    if (global._memLocks.has(lockKey)) return null;
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
  if (!key) return;
  const valkey = getValkey();
  if (valkey) {
    try {
      if (token) {
        const unlockLua = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await valkey.eval(unlockLua, 1, `${LOCK_PREFIX}${key}`, token);
      } else {
        await valkey.del(`${LOCK_PREFIX}${key}`);
      }
    } catch {}
  }

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
export async function incrementInFlight(connId) {
  if (!connId) return 1;
  const key = `active_req:${connId}`;
  const valkey = getValkey();
  if (valkey) {
    try {
      const count = await valkey.incr(key);
      if (count === 1) await valkey.expire(key, ACTIVE_REQUEST_TTL_SECONDS);
      return count;
    } catch {}
  }
  try {
    const count = memIncr(key);
    if (count === 1) memExpire(key, ACTIVE_REQUEST_TTL_SECONDS);
    return count;
  } catch {
    return 1;
  }
}

export async function decrementInFlight(connId) {
  if (!connId) return 0;
  const key = `active_req:${connId}`;
  const valkey = getValkey();
  if (valkey) {
    try {
      const decrLua = `
        local c = redis.call("decr", KEYS[1])
        if c <= 0 then
          redis.call("del", KEYS[1])
          return 0
        else
          return c
        end
      `;
      const res = await valkey.eval(decrLua, 1, key);
      return Number(res || 0);
    } catch {}
  }
  try {
    const raw = Number(memGet(key) || 0);
    const count = Math.max(0, raw - 1);
    if (count <= 0) {
      memDel(key);
      return 0;
    }
    memSet(key, String(count), ACTIVE_REQUEST_TTL_SECONDS);
    return count;
  } catch {
    return 0;
  }
}

/**
 * Distributed Active Requests Tracking across Cluster Workers.
 */
export async function registerActiveRequest(requestId, detail) {
  if (!requestId) return false;
  const payload = JSON.stringify({
    ...detail,
    requestId,
    expiresAt: Date.now() + ACTIVE_REQUEST_TTL_SECONDS * 1000,
  });

  const valkey = getValkey() || (await initValkey().catch(() => null));
  if (valkey) {
    try {
      await valkey.hset("axon:active_requests", requestId, payload);
    } catch {}
  }

  try {
    memSet(`active_req:detail:${requestId}`, payload, ACTIVE_REQUEST_TTL_SECONDS);
    if (!global._activeReqIndex) global._activeReqIndex = new Set();
    global._activeReqIndex.add(requestId);
    return true;
  } catch {
    return false;
  }
}

export async function unregisterActiveRequest(requestId) {
  if (!requestId) return false;
  const valkey = getValkey() || (await initValkey().catch(() => null));
  if (valkey) {
    try {
      await valkey.hdel("axon:active_requests", requestId);
    } catch {}
  }

  try {
    memDel(`active_req:detail:${requestId}`);
    global._activeReqIndex?.delete(requestId);
    return true;
  } catch {
    return false;
  }
}

export async function getActiveRequestsDistributed() {
  const valkey = getValkey() || (await initValkey().catch(() => null));
  if (valkey) {
    try {
      const rawMap = await valkey.hgetall("axon:active_requests");
      const now = Date.now();
      const out = [];
      const expired = [];
      for (const [id, raw] of Object.entries(rawMap)) {
        try {
          const item = JSON.parse(raw);
          if (item.expiresAt && item.expiresAt <= now) {
            expired.push(id);
          } else {
            out.push(item);
          }
        } catch {
          expired.push(id);
        }
      }
      if (expired.length > 0) {
        valkey.hdel("axon:active_requests", ...expired).catch(() => {});
      }
      return out;
    } catch {}
  }

  try {
    const index = global._activeReqIndex;
    if (!index || index.size === 0) return [];
    const now = Date.now();
    const out = [];
    const dead = [];
    for (const id of index) {
      const raw = memGet(`active_req:detail:${id}`);
      if (!raw) {
        dead.push(id);
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed.expiresAt && parsed.expiresAt <= now) {
          dead.push(id);
          continue;
        }
        out.push(parsed);
      } catch {
        dead.push(id);
      }
    }
    for (const id of dead) index.delete(id);
    return out;
  } catch {
    return [];
  }
}

/**
 * Cluster Real-Time Pub/Sub Event Broadcaster.
 */
export async function publishEvent(channel, payload) {
  return publishValkey(channel, payload);
}

/**
 * Quota Snapshot Cache Layer (TTL 120s).
 */
export async function setCachedQuota(connId, quotaData, ttlSeconds = 120) {
  if (!connId) return false;
  const key = `quota:snapshot:${connId}`;
  const payload = typeof quotaData === "string" ? quotaData : JSON.stringify(quotaData);
  const valkey = getValkey();
  if (valkey) {
    valkey.set(key, payload, "EX", ttlSeconds).catch(() => {});
  }
  try {
    memSet(key, payload, ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function getCachedQuota(connId) {
  if (!connId) return null;
  const key = `quota:snapshot:${connId}`;
  const valkey = getValkey();
  if (valkey) {
    try {
      const raw = await valkey.get(key);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  try {
    const raw = memGet(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteCachedQuota(connId) {
  if (!connId) return false;
  const key = `quota:snapshot:${connId}`;
  const valkey = getValkey();
  if (valkey) {
    valkey.del(key).catch(() => {});
  }
  try {
    memDel(key);
    return true;
  } catch {
    return false;
  }
}


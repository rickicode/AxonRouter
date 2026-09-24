// In-memory key-value store with TTL — speed layer for single-container deployments. All entries are process-local.
// PG remains the durable source of truth for locks/cooldowns; this store is
// purely a fast-path cache. Restart clears it (safe: PG re-read on miss).
if (!global._memoryStore) {
  global._memoryStore = new Map();
  global._memoryTimers = new Map();
}

const store = () => global._memoryStore;
const timers = () => global._memoryTimers;

function clearTimer(key) {
  const t = timers().get(key);
  if (t) {
    clearTimeout(t);
    timers().delete(key);
  }
  // Allow process to exit even with pending TTL timers.
  if (t?.unref) t.unref();
}

export function memSet(key, value, ttlSeconds = 0) {
  store().set(key, value);
  clearTimer(key);
  if (ttlSeconds > 0) {
    const ms = Math.min(ttlSeconds * 1000, 2 ** 31 - 1);
    const timer = setTimeout(() => {
      store().delete(key);
      timers().delete(key);
    }, ms);
    if (timer?.unref) timer.unref();
    timers().set(key, timer);
  }
}

export function memGet(key) {
  return store().has(key) ? store().get(key) : null;
}

export function memDel(...keys) {
  let n = 0;
  for (const key of keys) {
    clearTimer(key);
    if (store().delete(key)) n++;
  }
  return n;
}

export function memDelPrefix(prefix) {
  if (!prefix) return 0;
  let n = 0;
  for (const key of store().keys()) {
    if (key.startsWith(prefix)) {
      clearTimer(key);
      if (store().delete(key)) n++;
    }
  }
  return n;
}

export function memMget(keys) {
  return keys.map((k) => memGet(k));
}

export function memIncr(key) {
  const v = Number(store().get(key) || 0) + 1;
  // Preserve existing TTL if any; caller sets EXPIRE separately.
  store().set(key, String(v));
  return v;
}

export function memExpire(key, ttlSeconds) {
  if (!store().has(key)) return false;
  const v = store().get(key);
  memSet(key, v, ttlSeconds);
  return true;
}

export function memSize() {
  return store().size;
}

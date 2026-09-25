import { Redis } from "ioredis";

// ── Valkey / Redis Connection & Pub/Sub Manager ─────────────────────────────
// Provides shared state and pub/sub messaging across all cluster workers and
// the dashboard web server. Gracefully fails open to in-memory if unavailable.

const DEFAULT_PORT = 6379;
const DEFAULT_HOST = "127.0.0.1";

function resolveValkeyConfig() {
  const url = process.env.VALKEY_URL || process.env.REDIS_URL;
  if (url) {
    // ioredis only understands redis:// and rediss://. A "valkey://" scheme is
    // silently mis-parsed into host "valkey" / port 6379 instead of erroring,
    // so normalise it here and warn once rather than connect to a wrong host.
    if (/^valkeys?:\/\//i.test(url)) {
      const normalized = url.replace(/^valkeys:/i, "rediss:").replace(/^valkey:/i, "redis:");
      console.warn(
        `[Valkey] "${url.replace(/\/\/[^@]*@/, "//***@")}" uses the valkey:// scheme, which ioredis does not support. ` +
          `Retrying as ${normalized.replace(/\/\/[^@]*@/, "//***@")} (Valkey speaks the Redis protocol).`
      );
      return { url: normalized };
    }
    return { url };
  }

  const host = process.env.VALKEY_HOST || process.env.REDIS_HOST || DEFAULT_HOST;
  const port = Number(process.env.VALKEY_PORT || process.env.REDIS_PORT) || DEFAULT_PORT;
  const password = process.env.VALKEY_PASSWORD || process.env.REDIS_PASSWORD || undefined;
  const db = Number(process.env.VALKEY_DB || process.env.REDIS_DB) || 0;

  return { host, port, password, db };
}

if (!global._valkeyState) {
  global._valkeyState = {
    client: null,
    subscriber: null,
    isAvailable: false,
    initialized: false,
    initPromise: null,
    subscribers: new Map(), // channel -> Set of callbacks
    lastLogTs: 0,
  };
}

const state = global._valkeyState;

function createClientInstance(role = "client") {
  const config = resolveValkeyConfig();
  const options = {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 10) {
        return 10000;
      }
      return Math.min(times * 300, 3000);
    },
  };

  let client;
  if (config.url) {
    client = new Redis(config.url, options);
  } else {
    client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      ...options,
    });
  }

  client.on("connect", () => {
    state.isAvailable = true;
    const now = Date.now();
    if (now - state.lastLogTs > 60000) {
      console.log(`[Valkey] ${role} connected to ${config.url || `${config.host}:${config.port}`}`);
      state.lastLogTs = now;
    }
  });

  client.on("ready", () => {
    state.isAvailable = true;
  });

  client.on("error", (err) => {
    const now = Date.now();
    if (now - state.lastLogTs > 30000) {
      console.warn(`[Valkey] ${role} connection error (failing open to local memory):`, err.message);
      state.lastLogTs = now;
    }
    state.isAvailable = false;
  });

  client.on("close", () => {
    state.isAvailable = false;
  });

  return client;
}

export async function initValkey() {
  if (state.initialized && state.client) return state.client;
  if (state.initPromise) return state.initPromise;

  state.initPromise = (async () => {
    try {
      state.client = createClientInstance("client");
      state.subscriber = createClientInstance("subscriber");

      await Promise.race([
        Promise.all([state.client.connect(), state.subscriber.connect()]),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Valkey connection timeout")), 2500)),
      ]);

      state.isAvailable = true;
      state.initialized = true;

      state.subscriber.on("message", (channel, message) => {
        const listeners = state.subscribers.get(channel);
        if (listeners && listeners.size > 0) {
          for (const callback of listeners) {
            try {
              callback(message);
            } catch (err) {
              console.error(`[Valkey] Listener error on channel ${channel}:`, err);
            }
          }
        }
      });

      return state.client;
    } catch (err) {
      state.isAvailable = false;
      state.initialized = true;
      console.log(`[Valkey] Not reachable at boot (${err.message}). Using local in-memory fallback.`);
      return null;
    }
  })();

  return state.initPromise;
}

export function isValkeyAvailable() {
  return Boolean(state.client && state.isAvailable);
}

export function getValkey() {
  if (!state.client && !state.initPromise) {
    initValkey().catch(() => {});
  }
  return state.isAvailable ? state.client : null;
}

export function getValkeySubscriber() {
  if (!state.subscriber && !state.initPromise) {
    initValkey().catch(() => {});
  }
  return state.isAvailable ? state.subscriber : null;
}

/**
 * Publish message to a channel across all cluster nodes/processes.
 */
export async function publishValkey(channel, payload) {
  try {
    const client = getValkey() || await initValkey();
    if (!client) return false;
    const msg = typeof payload === "string" ? payload : JSON.stringify(payload);
    await client.publish(channel, msg);
    return true;
  } catch {
    return false;
  }
}

/**
 * Subscribe to a channel. Returns an unsubscribe function.
 */
export async function subscribeValkey(channel, callback) {
  if (!state.subscribers.has(channel)) {
    state.subscribers.set(channel, new Set());
  }
  state.subscribers.get(channel).add(callback);

  const sub = getValkeySubscriber() || (await initValkey(), getValkeySubscriber());
  if (sub && state.isAvailable) {
    try {
      await sub.subscribe(channel);
    } catch (err) {
      console.warn(`[Valkey] Failed to subscribe to channel ${channel}:`, err.message);
    }
  }

  return () => {
    const set = state.subscribers.get(channel);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        state.subscribers.delete(channel);
        if (sub && state.isAvailable) {
          sub.unsubscribe(channel).catch(() => {});
        }
      }
    }
  };
}

// ── Diagnostics ─────────────────────────────────────────────────────────────
// Round-trip latency for /api/health. Returns -1 when Valkey is not reachable
// so the caller can distinguish "absent" from "fast but zero ms". Never throws.
export async function valkeyPingLatencyMs() {
  const client = getValkey();
  if (!client) return -1;
  const start = Date.now();
  try {
    const result = await Promise.race([
      client.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 1000)),
    ]);
    return result === "PONG" ? Date.now() - start : -1;
  } catch {
    return -1;
  }
}

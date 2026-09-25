import { EventEmitter } from "events";
import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";
import { incrementInFlight, decrementInFlight, registerActiveRequest, unregisterActiveRequest, getActiveRequestsDistributed } from "@/lib/cache/client.js";
import { getValkey, publishValkey, subscribeValkey } from "@/lib/cache/valkeyClient.js";

function maskApiKey(key) {
  if (!key || typeof key !== "string") return null;
  if (key.length <= 8) return key.charAt(0) + "***";
  return key.slice(0, 8) + "***";
}

const PENDING_TIMEOUT_MS = 60 * 1000;
const RING_CAP = 50;
const CONN_CACHE_TTL_MS = 30 * 1000;
const USAGE_FLUSH_MS = 100;
const USAGE_FLUSH_MAX = 100;
const PERIOD_MS = { "24h": 86400000, "7d": 604800000, "30d": 2592000000, "60d": 5184000000 };

if (!global._pendingRequests) global._pendingRequests = { byModel: {}, byAccount: {} };
if (!global._lastErrorProvider) global._lastErrorProvider = { provider: "", ts: 0 };
if (!global._statsEmitter) {
  global._statsEmitter = new EventEmitter();
  global._statsEmitter.setMaxListeners(50);
}
if (!global._pendingTimers) global._pendingTimers = {};
if (!global._recentRing) global._recentRing = { items: [], initialized: false };
if (!global._connectionMapCache) global._connectionMapCache = { map: {}, ts: 0 };
if (!global._statsEmitTimers) global._statsEmitTimers = { pending: null, update: null };
if (!global._usageWriteQueue) global._usageWriteQueue = { items: [], timer: null, flushing: null };

const pendingRequests = global._pendingRequests;
const lastErrorProvider = global._lastErrorProvider;
const pendingTimers = global._pendingTimers;
const recentRing = global._recentRing;
const connCache = global._connectionMapCache;
const statsEmitTimers = global._statsEmitTimers;
const usageWriteQueue = global._usageWriteQueue;

export const statsEmitter = global._statsEmitter;

if (!global._statsSubscribed) {
  global._statsSubscribed = true;
  subscribeValkey("axon:events:stats", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.event && msg.originPid !== process.pid) {
        statsEmitter.emit(msg.event);
      }
    } catch {}
  }).catch(() => {});
}

function scheduleStatsEvent(event, delayMs = 150) {
  const key = event === "update" ? "update" : "pending";
  if (statsEmitTimers[key]) return;
  statsEmitTimers[key] = setTimeout(() => {
    statsEmitTimers[key] = null;
    statsEmitter.emit(event);
    publishValkey("axon:events:stats", {
      event,
      originPid: process.pid,
      ts: Date.now(),
    }).catch(() => {});
  }, delayMs);
  statsEmitTimers[key]?.unref?.();
}

function getLocalDateKey(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addToCounter(target, key, values) {
  if (!target[key]) target[key] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
  target[key].requests += values.requests || 1;
  target[key].promptTokens += values.promptTokens || 0;
  target[key].completionTokens += values.completionTokens || 0;
  target[key].cachedTokens += values.cachedTokens || 0;
  target[key].cost = (Number(target[key].cost) || 0) + (Number(values.cost) || 0);
  if (values.meta) Object.assign(target[key], values.meta);
}

function aggregateEntryToDay(day, entry) {
  const promptTokens = entry.tokens?.prompt_tokens || entry.tokens?.input_tokens || 0;
  const completionTokens = entry.tokens?.completion_tokens || entry.tokens?.output_tokens || 0;
  const cachedTokens = entry.tokens?.cached_tokens || entry.tokens?.cache_read_input_tokens || 0;
  const cost = entry.cost || 0;
  const vals = { promptTokens, completionTokens, cachedTokens, cost };

  day.requests = (day.requests || 0) + 1;
  day.promptTokens = (day.promptTokens || 0) + promptTokens;
  day.completionTokens = (day.completionTokens || 0) + completionTokens;
  day.cachedTokens = (day.cachedTokens || 0) + cachedTokens;
  day.cost = (Number(day.cost) || 0) + cost;

  day.byProvider ||= {};
  day.byModel ||= {};
  day.byAccount ||= {};
  day.byApiKey ||= {};
  day.byEndpoint ||= {};

  if (entry.provider) addToCounter(day.byProvider, entry.provider, vals);

  const modelKey = entry.provider ? `${entry.model}|${entry.provider}` : entry.model;
  addToCounter(day.byModel, modelKey, { ...vals, meta: { rawModel: entry.model, provider: entry.provider } });

  if (entry.connectionId) {
    addToCounter(day.byAccount, entry.connectionId, { ...vals, meta: { rawModel: entry.model, provider: entry.provider } });
  }

  const apiKeyMasked = maskApiKey(entry.apiKey) || "local-no-key";
  const akModelKey = `${apiKeyMasked}|${entry.model}|${entry.provider || "unknown"}`;
  addToCounter(day.byApiKey, akModelKey, { ...vals, meta: { rawModel: entry.model, provider: entry.provider, apiKeyMasked } });

  const endpoint = entry.endpoint || "Unknown";
  const epKey = `${endpoint}|${entry.model}|${entry.provider || "unknown"}`;
  addToCounter(day.byEndpoint, epKey, { ...vals, meta: { endpoint, rawModel: entry.model, provider: entry.provider } });
}

function pushToRing(entry) {
  recentRing.items.push(entry);
  if (recentRing.items.length > RING_CAP) {
    recentRing.items = recentRing.items.slice(-RING_CAP);
  }
  const valkey = getValkey();
  if (valkey) {
    try {
      const payload = JSON.stringify(entry);
      valkey.lpush("axon:recent_requests", payload)
        .then(() => valkey.ltrim("axon:recent_requests", 0, RING_CAP - 1))
        .catch(() => {});
    } catch {}
  }
}

// Usage write batcher — one DB transaction per flush window instead of one
// transaction per request. At 1000+ req/min the per-write transaction pattern
// serialized every request on the usage_daily row (SELECT ... FOR UPDATE +
// read-modify-write of the day JSONB) and exhausted the 25-conn pool.
function applyFailedToDay(day, item) {
  day.requests = (day.requests || 0) + 1;
  day.failedRequests = (day.failedRequests || 0) + 1;
  if (item.provider) {
    day.byProvider ||= {};
    if (!day.byProvider[item.provider]) day.byProvider[item.provider] = { requests: 0, failedRequests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
    day.byProvider[item.provider].requests = (day.byProvider[item.provider].requests || 0) + 1;
    day.byProvider[item.provider].failedRequests = (day.byProvider[item.provider].failedRequests || 0) + 1;
  }
  if (item.model) {
    const modelKey = item.provider ? `${item.model}|${item.provider}` : item.model;
    day.byModel ||= {};
    if (!day.byModel[modelKey]) day.byModel[modelKey] = { requests: 0, failedRequests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: item.model, provider: item.provider };
    day.byModel[modelKey].requests = (day.byModel[modelKey].requests || 0) + 1;
    day.byModel[modelKey].failedRequests = (day.byModel[modelKey].failedRequests || 0) + 1;
  }
}

async function insertHistoryChunk(tx, rows) {
  if (rows.length === 0) return 0;
  const params = [];
  const tuples = rows.map((r) => {
    const base = params.length;
    params.push(
      r.timestamp, r.provider, r.model, r.connectionId, r.apiKey, r.endpoint,
      r.promptTokens, r.completionTokens, r.cost, r.status, r.tokens, r.meta, r.requestId,
    );
    return r.requestId
      ? `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11}::jsonb,$${base + 12}::jsonb,$${base + 13}::text)`
      : `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11}::jsonb,$${base + 12}::jsonb,NULL)`;
  });
  const sqlText = `INSERT INTO usage_history
     (timestamp, provider, model, connection_id, api_key, endpoint, prompt_tokens, completion_tokens, cost, status, tokens, meta, request_id)
   VALUES ${tuples.join(",")}
   ON CONFLICT (request_id, timestamp) DO NOTHING`;
  const res = await tx.run(sqlText, params);
  return res?.changes ?? 0;
}

export async function flushUsageQueue() {
  const batch = usageWriteQueue.items.splice(0, Math.max(usageWriteQueue.items.length, USAGE_FLUSH_MAX));
  if (batch.length === 0) return;
  try {
    // Success rows carry a cost PROMISE (pricing lookup kicked off at enqueue).
    // Settle it before the transaction so the daily rollup and the history
    // insert see a plain number; the un-awaited promise used to serialize
    // usage_daily.cost as garbage/null.
    for (const item of batch) {
      if (item.cost && typeof item.cost.then === "function") {
        try { item.cost = (await item.cost) || 0; } catch { item.cost = 0; }
      }
    }
    const db = await getAdapter();
    await db.transaction(async (tx) => {
      // Per-row insert preserves ON CONFLICT idempotency (requestId path) while
      // the outer transaction amortizes lock + commit cost across the batch.
      const aggregated = [];
    for (const item of batch) {
      if (item.failed || item.cost !== undefined) aggregated.push(item);
    }

      const byDate = new Map();
      for (const item of aggregated) {
        const dateKey = item.dateKey;
        if (!byDate.has(dateKey)) byDate.set(dateKey, []);
        byDate.get(dateKey).push(item);
      }
      for (const [dateKey, items] of byDate) {
        // Guarantee row exists before FOR UPDATE to serialize concurrent workers on new dates
        await tx.run(
          `INSERT INTO usage_daily (date_key, data) VALUES ($1, '{}'::jsonb) ON CONFLICT (date_key) DO NOTHING`,
          [dateKey],
        );
        const row = await tx.get(`SELECT data FROM usage_daily WHERE date_key = $1 FOR UPDATE`, [dateKey]);
        const rawData = row?.data;
        const day = (typeof rawData === "string" ? parseJson(rawData, null) : rawData) ?? {
          requests: 0, failedRequests: 0, promptTokens: 0, completionTokens: 0, cost: 0,
          byProvider: {}, byModel: {}, byAccount: {}, byApiKey: {}, byEndpoint: {},
        };
        for (const item of items) {
          if (item.failed) applyFailedToDay(day, item);
          else aggregateEntryToDay(day, item);
        }
        await tx.run(
          `INSERT INTO usage_daily (date_key, data) VALUES ($1, $2)
           ON CONFLICT (date_key) DO UPDATE SET data = EXCLUDED.data`,
          [dateKey, day],
        );
      }

      // Raw per-request rows: getLast10Minutes, the today/24h stats path,
      // recent-ring hydration and the request log all read usage_history. The
      // batcher originally wrote only usage_daily and silently dropped this
      // insert, freezing usage_history (and every view over it).
      await insertHistoryChunk(tx, aggregated);

      await tx.run(
        `INSERT INTO _meta (key, value) VALUES ('totalRequestsLifetime', $1::text)
         ON CONFLICT (key) DO UPDATE SET value = ((COALESCE(_meta.value, '0')::bigint) + ($2::text)::bigint)::text`,
        [String(batch.length), String(batch.length)],
      );
    });
    for (const item of batch) item.resolve?.();
  } catch (err) {
    console.error("[usage] flush failed:", err);
    for (const item of batch) item.reject?.(err);
  }
}

function enqueueUsageWrite(item) {
  return new Promise((resolve, reject) => {
    item.resolve = resolve;
    item.reject = reject;
    usageWriteQueue.items.push(item);
    if (usageWriteQueue.flushing) {
      // A flush is running — the timer below covers items pushed after it started.
    }
    if (!usageWriteQueue.timer) {
      usageWriteQueue.timer = setTimeout(() => {
        usageWriteQueue.timer = null;
        usageWriteQueue.flushing = flushUsageQueue().finally(() => {
          usageWriteQueue.flushing = null;
          if (usageWriteQueue.items.length > 0) {
            usageWriteQueue.flushing = flushUsageQueue().finally(() => {
              usageWriteQueue.flushing = null;
            });
          }
        });
      }, USAGE_FLUSH_MS);
      usageWriteQueue.timer.unref?.();
    }
    if (usageWriteQueue.items.length >= USAGE_FLUSH_MAX && usageWriteQueue.timer) {
      clearTimeout(usageWriteQueue.timer);
      usageWriteQueue.timer = null;
      usageWriteQueue.flushing = flushUsageQueue().finally(() => {
        usageWriteQueue.flushing = null;
        if (usageWriteQueue.items.length > 0) {
          usageWriteQueue.flushing = flushUsageQueue().finally(() => {
            usageWriteQueue.flushing = null;
          });
        }
      });
    }
  });
}

async function getConnectionMapCached() {
  if (Date.now() - connCache.ts < CONN_CACHE_TTL_MS) return connCache.map;
  try {
    const db = await getAdapter();
    const rows = await db.all(
      `SELECT id, name, email FROM provider_connections`
    );
    const map = {};
    for (const r of rows) map[r.id] = r.name || r.email || r.id;
    connCache.map = map;
    connCache.ts = Date.now();
  } catch {}
  return connCache.map;
}

async function ensureRingInitialized() {
  if (recentRing.initialized) return;
  recentRing.initialized = true;
  try {
    const db = await getAdapter();
    const rows = await db.all(
      `SELECT timestamp, provider, model, connection_id, api_key, endpoint, cost, status, tokens, meta
       FROM usage_history ORDER BY id DESC LIMIT $1`,
      [RING_CAP],
    );
    recentRing.items = rows.reverse().map((row) => {
      const meta = typeof row.meta === "string" ? parseJson(row.meta, {}) : (row.meta || {});
       const normalizedStatus = row.status || (meta.failed ? "error_502" : "ok");
       return {
        timestamp: row.timestamp,
        provider: row.provider,
        model: row.model,
        connectionId: row.connection_id,
        apiKey: row.api_key,
        endpoint: row.endpoint,
        cost: row.cost,
         status: normalizedStatus,
        tokens: row.tokens ?? {},
        meta,
        error: meta.error || null,
      };
    });
  } catch {}
}

async function calculateCost(provider, model, tokens) {
  if (!tokens || !provider || !model) return 0;
  try {
    const { getPricingForModel } = await import("./pricingRepo.js");
    const pricing = await getPricingForModel(provider, model);
    if (!pricing) return 0;
    const { calculateCostFromTokens } = await import("open-sse/providers/pricing.js");
    return calculateCostFromTokens(tokens, pricing);
  } catch (error) {
    console.error("Error calculating cost:", error);
    return 0;
  }
}

const liveActiveRequests = new Map();
let lastActiveRequestsPrune = 0;
export async function trackPendingRequest(model, provider, connectionId, started, error = false, options = {}) {
  const modelKey = provider ? `${model} (${provider})` : model;
  const timerKey = options.requestId || `${connectionId}|${modelKey}`;

  if (started) {
    const entry = {
      requestId: timerKey,
      model,
      provider,
      connectionId,
      apiKey: options.apiKey || null,
      isStream: options.isStream !== undefined ? Boolean(options.isStream) : true,
      startedAt: new Date().toISOString(),
    };
    liveActiveRequests.set(timerKey, entry);
    await registerActiveRequest(timerKey, entry).catch(() => {});
    getAdapter().then((db) => {
      db.run(
        `INSERT INTO active_requests (request_id, model, provider, connection_id, api_key, is_stream, started_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW() + INTERVAL '120 seconds')
         ON CONFLICT (request_id) DO UPDATE SET expires_at = NOW() + INTERVAL '120 seconds'`,
        [timerKey, model, provider, connectionId || null, options.apiKey || null, options.isStream !== undefined ? Boolean(options.isStream) : true]
      ).catch(() => {});
    }).catch(() => {});
  } else {
    const wasActive = liveActiveRequests.delete(timerKey);
    await unregisterActiveRequest(timerKey).catch(() => {});
    getAdapter().then((db) => {
      db.run(`DELETE FROM active_requests WHERE request_id = $1`, [timerKey]).catch(() => {});
    }).catch(() => {});
    // Completion/error callbacks can race with the stale-request watchdog.
    // Do not decrement counters twice when the watchdog already finalized it.
    if (!wasActive && !options.forceStop) {
      if (error && provider) {
        lastErrorProvider.provider = provider.toLowerCase();
        lastErrorProvider.ts = Date.now();
      }
      scheduleStatsEvent("pending");
      return;
    }
  }

  if (!pendingRequests.byModel[modelKey]) pendingRequests.byModel[modelKey] = 0;
  pendingRequests.byModel[modelKey] = Math.max(0, pendingRequests.byModel[modelKey] + (started ? 1 : -1));
  if (pendingRequests.byModel[modelKey] === 0) delete pendingRequests.byModel[modelKey];

  if (connectionId) {
    if (!pendingRequests.byAccount[connectionId]) pendingRequests.byAccount[connectionId] = {};
    if (!pendingRequests.byAccount[connectionId][modelKey]) pendingRequests.byAccount[connectionId][modelKey] = 0;
    pendingRequests.byAccount[connectionId][modelKey] = Math.max(0, pendingRequests.byAccount[connectionId][modelKey] + (started ? 1 : -1));
    if (pendingRequests.byAccount[connectionId][modelKey] === 0) {
      delete pendingRequests.byAccount[connectionId][modelKey];
      if (Object.keys(pendingRequests.byAccount[connectionId]).length === 0) {
        delete pendingRequests.byAccount[connectionId];
      }
    }

    // In-flight concurrency tracker (memory speed layer)
    if (started) {
      incrementInFlight(connectionId).catch(() => {});
    } else {
      decrementInFlight(connectionId).catch(() => {});
    }
  }

  if (started) {
    clearTimeout(pendingTimers[timerKey]);
    pendingTimers[timerKey] = setTimeout(() => {
      delete pendingTimers[timerKey];
      trackPendingRequest(model, provider, connectionId, false, true, { requestId: timerKey, forceStop: true });
    }, PENDING_TIMEOUT_MS);
  } else {
    clearTimeout(pendingTimers[timerKey]);
    delete pendingTimers[timerKey];
  }

  if (!started && error && provider) {
    const p = provider.toLowerCase();
    lastErrorProvider.provider = p;
    lastErrorProvider.ts = Date.now();
    const valkey = getValkey();
    if (valkey) {
      valkey.set("axon:last_error_provider", p, "EX", 10).catch(() => {});
    }
  }

  scheduleStatsEvent("pending");
}

export async function getActiveRequests() {
  const activeRequests = [];
  const localItems = [...liveActiveRequests.values()];
  let distItems = [];
  let dbItems = [];
  const valkey = getValkey();
  if (valkey) {
    try {
      distItems = await getActiveRequestsDistributed();
    } catch {}
  } else {
    try {
      const db = await getAdapter();
      const now = Date.now();
      if (now - lastActiveRequestsPrune > 30000) {
        lastActiveRequestsPrune = now;
        db.run("DELETE FROM active_requests WHERE expires_at <= NOW()").catch(() => {});
      }
      const rows = await db.all(
        `SELECT request_id, model, provider, connection_id, api_key, is_stream, started_at
         FROM active_requests
         WHERE expires_at > NOW()
         ORDER BY started_at DESC LIMIT 100`
      );
      dbItems = (rows || []).map((r) => ({
        requestId: r.request_id,
        model: r.model,
        provider: r.provider,
        connectionId: r.connection_id,
        apiKey: r.api_key,
        isStream: r.is_stream,
        startedAt: r.started_at instanceof Date ? r.started_at.toISOString() : String(r.started_at),
      }));
    } catch {}
  }

  const mergedMap = new Map();
  for (const item of localItems) mergedMap.set(item.requestId || `${item.connectionId}|${item.model}`, item);
  for (const item of distItems) mergedMap.set(item.requestId || `${item.connectionId}|${item.model}`, item);
  for (const item of dbItems) mergedMap.set(item.requestId, item);
  const items = [...mergedMap.values()];

  const connectionMap = await getConnectionMapCached();
  let allApiKeys = [];
  try {
    const { getApiKeys } = await import("./apiKeysRepo.js");
    allApiKeys = await getApiKeys();
  } catch {}
  const apiKeyMap = {};
  for (const k of allApiKeys) apiKeyMap[k.key] = k.name;

  for (const item of items) {
    const accountName = connectionMap[item.connectionId] || item.connectionId || `Unknown Account (${item.provider})`;
    const keyName = apiKeyMap[item.apiKey] || (item.apiKey ? maskApiKey(item.apiKey) : "Default Key");
    activeRequests.push({
      model: item.model,
      provider: item.provider,
      account: accountName,
      connectionId: item.connectionId || null,
      apiKey: keyName,
      clientApiKey: keyName,
      rawApiKey: item.apiKey,
      isStream: item.isStream,
      startedAt: item.startedAt,
      status: "streaming",
    });
  }

  if (activeRequests.length === 0) {
    for (const [connectionId, models] of Object.entries(pendingRequests.byAccount)) {
      for (const [modelKey, count] of Object.entries(models)) {
        if (count > 0) {
          const accountName = connectionMap[connectionId] || connectionId || `Unknown Account`;
          const match = modelKey.match(/^(.*) \((.*)\)$/);
          activeRequests.push({
            model: match ? match[1] : modelKey,
            provider: match ? match[2] : "unknown",
            account: accountName,
            connectionId,
            count,
            apiKey: "Default Key",
            clientApiKey: "Default Key",
            isStream: true,
            status: "streaming",
            startedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  let rawRingItems = [];
  if (valkey) {
    try {
      const list = await valkey.lrange("axon:recent_requests", 0, RING_CAP - 1);
      if (list && list.length > 0) {
        rawRingItems = list.map((item) => {
          try {
            return JSON.parse(item);
          } catch {
            return null;
          }
        }).filter(Boolean);
      }
    } catch {}
  }

  if (rawRingItems.length === 0) {
    await ensureRingInitialized();
    rawRingItems = [...recentRing.items];
    if (valkey && rawRingItems.length > 0) {
      const serialized = rawRingItems.map((e) => JSON.stringify(e));
      valkey.rpush("axon:recent_requests", ...serialized)
        .then(() => valkey.ltrim("axon:recent_requests", 0, RING_CAP - 1))
        .catch(() => {});
    }
  }

  const seen = new Set();
  const recentRequests = rawRingItems
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map((entry) => {
      const rawTokens = entry.tokens || {};
      const tokens = typeof rawTokens === "string" ? parseJson(rawTokens, {}) : rawTokens;
      const ts = entry.timestamp instanceof Date ? entry.timestamp.toISOString() : String(entry.timestamp || "");
      const meta = typeof entry.meta === "string" ? parseJson(entry.meta, {}) : (entry.meta || {});
      const isStream = meta.isStream !== undefined
        ? Boolean(meta.isStream)
        : (entry.isStream !== undefined ? Boolean(entry.isStream) : (entry.endpoint ? !entry.endpoint.includes("embeddings") : true));
      const keyName = apiKeyMap[entry.apiKey] || (entry.apiKey ? maskApiKey(entry.apiKey) : "Default Key");
      return {
        timestamp: ts,
        model: entry.model,
        provider: entry.provider || "",
        account: entry.account || meta.account || connectionMap[entry.connectionId] || (entry.provider === "opencode" ? "Direct (Free)" : entry.provider || "Unknown"),
        connectionId: entry.connectionId || null,
        apiKey: keyName,
        clientApiKey: keyName,
        rawApiKey: entry.apiKey || "",
        endpoint: entry.endpoint || "/v1/chat/completions",
        isStream,
        promptTokens: tokens.prompt_tokens || tokens.input_tokens || 0,
        completionTokens: tokens.completion_tokens || tokens.output_tokens || 0,
       status: entry.status || (meta.failed ? "error_502" : "ok"),
        error: entry.error || meta.error || null,
      };
    })
    .filter((entry) => {
      const isFailed = entry.status === "failed"
        || entry.status === "error"
        || String(entry.status || "").startsWith("error_");
      if (!isFailed && entry.status === "ok" && entry.promptTokens === 0 && entry.completionTokens === 0) return false;
      const sec = entry.timestamp ? entry.timestamp.slice(0, 19) : "";
       const key = isFailed
         ? `${entry.timestamp}|${entry.model}|${entry.provider}|${entry.connectionId || ""}|${entry.status}`
         : `${entry.model}|${entry.provider}|${entry.apiKey}|${entry.promptTokens}|${entry.completionTokens}|${sec}|${entry.status}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);

  let errorProvider = (Date.now() - lastErrorProvider.ts < 10000) ? lastErrorProvider.provider : "";
  if (!errorProvider && valkey) {
    try {
      const v = await valkey.get("axon:last_error_provider");
      if (v) errorProvider = v;
    } catch {}
  }
  return { activeRequests, recentRequests, errorProvider };
}

export async function saveFailedRequest({ provider, model, connectionId, apiKey, endpoint, errorStatus, isStream, error, account, comboName }) {
  try {
    const ts = new Date().toISOString();
    const status = `error_${errorStatus || 502}`;
    const isStreamBool = Boolean(isStream);
    const errorMsg = typeof error === "string"
      ? error
      : (error ? (error.message || (typeof error === "object" ? JSON.stringify(error) : String(error))) : null);

    // Fire-and-forget: never await enqueueUsageWrite in the request hot path.
    // The batcher persists in the background; the caller's response is not blocked.
    enqueueUsageWrite({
      dateKey: getLocalDateKey(ts),
      timestamp: ts,
      failed: true,
      provider: provider || null,
      model: model || null,
      connectionId: connectionId || null,
      apiKey: apiKey || null,
      endpoint: endpoint || null,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      status,
      tokens: {},
      meta: { isStream: isStreamBool, failed: true, error: errorMsg, account: account || undefined, ...(comboName ? { comboName } : {}) },
    }).catch(() => {}); // fire-and-forget: flush errors are logged in flushUsageQueue

    pushToRing({
      timestamp: ts,
      provider: provider || "",
      model: model || "",
      connectionId: connectionId || "",
      account: account || (connectionId ? `Account ${connectionId.slice(0, 8)}...` : ""),
      apiKey: apiKey || "",
      endpoint: endpoint || "/v1/chat/completions",
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      status,
      tokens: {},
      meta: { isStream: isStreamBool, failed: true, error: errorMsg, account: account || undefined },
      isStream: isStreamBool,
      error: errorMsg,
    });

    if (provider) {
      const p = provider.toLowerCase();
      lastErrorProvider.provider = p;
      lastErrorProvider.ts = Date.now();
      const v = getValkey();
      if (v) {
        v.set("axon:last_error_provider", p, "EX", 10).catch(() => {});
      }
    }
    scheduleStatsEvent("update", 250);
  } catch (_) { /* fail-open */ }
}

export async function saveRequestUsage(entry) {
  try {
    if (!entry.timestamp) entry.timestamp = new Date().toISOString();
    const tokens = entry.tokens || {};
    const promptTokens = tokens.prompt_tokens || tokens.input_tokens || 0;
    const completionTokens = tokens.completion_tokens || tokens.output_tokens || 0;
    // Cost calc is also async DB work — keep it off the hot path too.
    const costPromise = entry.cost == null
      ? calculateCost(entry.provider, entry.model, tokens)
      : Promise.resolve(entry.cost);
    const entryMeta = JSON.stringify(
      typeof entry.meta === "string"
        ? (parseJson(entry.meta, {}) || {})
        : (entry.meta || {})
    ) || "{}";

    // Fire-and-forget: never await enqueueUsageWrite in the request hot path.
    enqueueUsageWrite({
      dateKey: getLocalDateKey(entry.timestamp),
      timestamp: entry.timestamp,
      failed: false,
      provider: entry.provider || null,
      model: entry.model || null,
      connectionId: entry.connectionId || null,
      apiKey: entry.apiKey || null,
      endpoint: entry.endpoint || null,
      promptTokens,
      completionTokens,
      cost: costPromise.then((c) => c || 0),
      status: entry.status || "ok",
      tokens,
      meta: entryMeta,
      requestId: entry.requestId || null,
      _rawEntry: entry,
    }).catch(() => {}); // fire-and-forget: flush errors are logged in flushUsageQueue

    pushToRing(entry);
    scheduleStatsEvent("update", 250);
  } catch (error) {
    console.error("Failed to save usage stats:", error);
  }
}

export async function getUsageHistory(filter = {}) {
  const db = await getAdapter();
  const conditions = [];
  const params = [];
  const add = (condition, value) => {
    params.push(value);
    conditions.push(condition.replace("?", `$${params.length}`));
  };

  if (filter.provider) add("provider = ?", filter.provider);
  if (filter.model) add("model = ?", filter.model);
  if (filter.startDate) add("timestamp >= ?", new Date(filter.startDate).toISOString());
  if (filter.endDate) add("timestamp <= ?", new Date(filter.endDate).toISOString());

  const limit = Math.min(Math.max(Number(filter.limit) || 100, 1), 500);
  const offset = Math.max(Number(filter.offset) || 0, 0);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.all(
    `SELECT timestamp, provider, model, connection_id, api_key, endpoint, cost, status, tokens
     FROM usage_history ${where} ORDER BY timestamp DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  return rows.map((r) => ({
    timestamp: r.timestamp,
    provider: r.provider,
    model: r.model,
    connectionId: r.connection_id,
    // PostgreSQL snake_case equivalent of legacy apiKeyMasked: maskApiKey(r.apiKey).
    apiKeyMasked: maskApiKey(r.api_key),
    endpoint: r.endpoint,
    cost: r.cost,
    status: r.status,
    tokens: r.tokens ?? {},
  }));
}

function buildAggregatesFromDays(dayRows, connectionMap = {}, providerNodeNameMap = {}, apiKeyMap = {}) {
  const stats = {
    totalRequests: 0,
    totalFailedRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCachedTokens: 0,
    totalCost: 0,
    byProvider: {},
    byModel: {},
    byAccount: {},
    byApiKey: {},
    byEndpoint: {},
  };

  for (const dayData of dayRows) {
    stats.totalPromptTokens += Number(dayData.promptTokens || 0);
    stats.totalCompletionTokens += Number(dayData.completionTokens || 0);
    stats.totalCachedTokens += Number(dayData.cachedTokens || 0);
    stats.totalCost += Number(dayData.cost) || 0;
    stats.totalFailedRequests += Number(dayData.failedRequests || 0);

    for (const [provider, p] of Object.entries(dayData.byProvider || {})) {
      if (!stats.byProvider[provider]) stats.byProvider[provider] = { requests: 0, failedRequests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
      stats.byProvider[provider].requests += Number(p.requests || 0);
      stats.byProvider[provider].failedRequests = (stats.byProvider[provider].failedRequests || 0) + Number(p.failedRequests || 0);
      stats.byProvider[provider].promptTokens += Number(p.promptTokens || 0);
      stats.byProvider[provider].completionTokens += Number(p.completionTokens || 0);
      stats.byProvider[provider].cachedTokens += Number(p.cachedTokens || 0);
      stats.byProvider[provider].cost += Number(p.cost) || 0;
    }

    for (const [modelKey, m] of Object.entries(dayData.byModel || {})) {
      if (!stats.byModel[modelKey]) stats.byModel[modelKey] = { requests: 0, failedRequests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: m.rawModel, provider: m.provider, lastUsed: dayData.dateKey };
      stats.byModel[modelKey].requests += Number(m.requests || 0);
      stats.byModel[modelKey].failedRequests = (stats.byModel[modelKey].failedRequests || 0) + Number(m.failedRequests || 0);
      stats.byModel[modelKey].promptTokens += Number(m.promptTokens || 0);
      stats.byModel[modelKey].completionTokens += Number(m.completionTokens || 0);
      stats.byModel[modelKey].cachedTokens += Number(m.cachedTokens || 0);
      stats.byModel[modelKey].cost += Number(m.cost) || 0;
      if (dayData.dateKey > (stats.byModel[modelKey].lastUsed || "")) stats.byModel[modelKey].lastUsed = dayData.dateKey;
    }

    for (const [accountKey, a] of Object.entries(dayData.byAccount || {})) {
      if (!stats.byAccount[accountKey]) stats.byAccount[accountKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: a.rawModel, provider: a.provider, connectionId: a.connectionId, accountName: a.accountName, lastUsed: dayData.dateKey };
      stats.byAccount[accountKey].requests += Number(a.requests || 0);
      stats.byAccount[accountKey].promptTokens += Number(a.promptTokens || 0);
      stats.byAccount[accountKey].completionTokens += Number(a.completionTokens || 0);
      stats.byAccount[accountKey].cachedTokens += Number(a.cachedTokens || 0);
      stats.byAccount[accountKey].cost += Number(a.cost) || 0;
      if (dayData.dateKey > (stats.byAccount[accountKey].lastUsed || "")) stats.byAccount[accountKey].lastUsed = dayData.dateKey;
    }

    for (const [apiKeyKey, ak] of Object.entries(dayData.byApiKey || {})) {
      if (!stats.byApiKey[apiKeyKey]) stats.byApiKey[apiKeyKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: ak.rawModel, provider: ak.provider, apiKeyMasked: ak.apiKeyMasked, keyName: ak.keyName, apiKeyKey: ak.apiKeyKey, lastUsed: dayData.dateKey };
      stats.byApiKey[apiKeyKey].requests += Number(ak.requests || 0);
      stats.byApiKey[apiKeyKey].promptTokens += Number(ak.promptTokens || 0);
      stats.byApiKey[apiKeyKey].completionTokens += Number(ak.completionTokens || 0);
      stats.byApiKey[apiKeyKey].cachedTokens += Number(ak.cachedTokens || 0);
      stats.byApiKey[apiKeyKey].cost += Number(ak.cost) || 0;
      if (dayData.dateKey > (stats.byApiKey[apiKeyKey].lastUsed || "")) stats.byApiKey[apiKeyKey].lastUsed = dayData.dateKey;
    }

    for (const [endpointKey, ep] of Object.entries(dayData.byEndpoint || {})) {
      if (!stats.byEndpoint[endpointKey]) stats.byEndpoint[endpointKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, endpoint: ep.endpoint, rawModel: ep.rawModel, provider: ep.provider, lastUsed: dayData.dateKey };
      stats.byEndpoint[endpointKey].requests += Number(ep.requests || 0);
      stats.byEndpoint[endpointKey].promptTokens += Number(ep.promptTokens || 0);
      stats.byEndpoint[endpointKey].completionTokens += Number(ep.completionTokens || 0);
      stats.byEndpoint[endpointKey].cachedTokens += Number(ep.cachedTokens || 0);
      stats.byEndpoint[endpointKey].cost += Number(ep.cost) || 0;
      if (dayData.dateKey > (stats.byEndpoint[endpointKey].lastUsed || "")) stats.byEndpoint[endpointKey].lastUsed = dayData.dateKey;
    }
  }

  const normalizedByProvider = {};
  for (const [provider, value] of Object.entries(stats.byProvider)) {
    normalizedByProvider[provider] = value;
  }
  stats.byProvider = normalizedByProvider;

  const normalizedByModel = {};
  for (const [modelKey, value] of Object.entries(stats.byModel)) {
    const provider = value.provider || modelKey.split("|").slice(1).join("|");
    const rawModel = value.rawModel || modelKey.split("|")[0];
    const displayProvider = providerNodeNameMap[provider] || provider;
    normalizedByModel[`${rawModel} (${provider})`] = {
      ...value,
      rawModel,
      // Provider IDs are routing identity. Never replace them with a mutable
      // display label such as a provider node named "Cline".
      provider,
      providerId: provider,
      providerName: displayProvider,
    };
  }
  stats.byModel = normalizedByModel;

  const normalizedByAccount = {};
  for (const [connectionId, value] of Object.entries(stats.byAccount)) {
    const accountName = connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
    const provider = value.provider || "unknown";
    const rawModel = value.rawModel || "unknown";
    normalizedByAccount[`${rawModel} (${provider} - ${accountName})`] = {
      ...value,
      rawModel,
      provider,
      providerId: provider,
      providerName: providerNodeNameMap[provider] || provider,
      connectionId,
      accountName,
    };
  }
  stats.byAccount = normalizedByAccount;

  const normalizedByApiKey = {};
  for (const [key, value] of Object.entries(stats.byApiKey)) {
    const [rawApiKey, rawModel, ...providerParts] = key.split("|");
    const provider = value.provider || providerParts.join("|") || "unknown";
    const apiKeyInfo = apiKeyMap[rawApiKey];
    normalizedByApiKey[key] = {
      ...value,
      rawModel: value.rawModel || rawModel,
      provider,
      providerId: provider,
      providerName: providerNodeNameMap[provider] || provider,
      apiKeyMasked: value.apiKeyMasked || (rawApiKey === "local-no-key" ? null : maskApiKey(rawApiKey)),
      keyName: value.keyName || apiKeyInfo?.name || (rawApiKey === "local-no-key" ? "Local (No API Key)" : `${rawApiKey.slice(0, 8)}...`),
      apiKeyKey: value.apiKeyKey || (rawApiKey === "local-no-key" ? rawApiKey : maskApiKey(rawApiKey)),
    };
  }
  stats.byApiKey = normalizedByApiKey;

  const normalizedByEndpoint = {};
  for (const [endpointKey, value] of Object.entries(stats.byEndpoint)) {
    const [endpoint, rawModel, ...providerParts] = endpointKey.split("|");
    const provider = value.provider || providerParts.join("|") || "unknown";
    normalizedByEndpoint[endpointKey] = {
      ...value,
      endpoint: value.endpoint || endpoint,
      rawModel: value.rawModel || rawModel,
      provider,
      providerId: provider,
      providerName: providerNodeNameMap[provider] || provider,
    };
  }
  stats.byEndpoint = normalizedByEndpoint;
  stats.totalRequests = Object.values(stats.byProvider).reduce((sum, p) => sum + (p.requests || 0), 0);
  stats.totalFailedRequests = Object.values(stats.byProvider).reduce((sum, p) => sum + (p.failedRequests || 0), 0);
  return stats;
}

/**
 * Requests per minute for the last 30 minutes, always returning the full window
 * of buckets (including zero-traffic minutes) so the client can render a stable
 * series instead of a shrinking one.
 */
export async function getLast10Minutes(dbArg) {
  const db = dbArg || (await getAdapter());
  const now = new Date();
  const currentMinuteStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const windowStart = new Date(currentMinuteStart.getTime() - 29 * 60 * 1000);
  const bucketMap = {};
  const buckets = [];
  for (let i = 0; i < 30; i++) {
    const ts = currentMinuteStart.getTime() - (29 - i) * 60 * 1000;
    bucketMap[ts] = { timestamp: ts, requests: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
    buckets.push(bucketMap[ts]);
  }
  const recent10 = await db.all(
    `SELECT timestamp, prompt_tokens, completion_tokens, cost FROM usage_history
     WHERE timestamp >= $1 AND timestamp <= $2`,
    [windowStart.toISOString(), now.toISOString()],
  );
  for (const row of recent10) {
    const tt = new Date(row.timestamp).getTime();
    const minuteStart = Math.floor(tt / 60000) * 60000;
    if (bucketMap[minuteStart]) {
      bucketMap[minuteStart].requests++;
      bucketMap[minuteStart].promptTokens += row.prompt_tokens || 0;
      bucketMap[minuteStart].completionTokens += row.completion_tokens || 0;
      bucketMap[minuteStart].cost += row.cost || 0;
    }
  }
  return buckets;
}

export async function getUsageStats(period = "all") {
  const db = await getAdapter();

  const [{ getApiKeys }, { getProviderNodes }] = await Promise.all([
    import("./apiKeysRepo.js"),
    import("./nodesRepo.js"),
  ]);

  const connectionMap = await getConnectionMapCached();

  const providerNodeNameMap = {};
  try {
    const nodes = await getProviderNodes();
    for (const n of nodes) if (n.id && n.name) providerNodeNameMap[n.id] = n.name;
  } catch {}

  let allApiKeys = [];
  try { allApiKeys = await getApiKeys(); } catch {}
  const apiKeyMap = {};
  for (const k of allApiKeys) apiKeyMap[k.key] = { name: k.name, id: k.id, createdAt: k.createdAt };

  const recentRows = await db.all(
    `SELECT timestamp, provider, model, connection_id, tokens, status, api_key, endpoint, meta FROM usage_history ORDER BY id DESC LIMIT 100`,
  );
  const seen = new Set();
  const recentRequests = recentRows
    .map((row) => {
      const rawTokens = row.tokens || {};
      const tokens = typeof rawTokens === "string" ? parseJson(rawTokens, {}) : rawTokens;
      const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || "");
      const meta = typeof row.meta === "string" ? parseJson(row.meta, {}) : (row.meta || {});
       const isStream = meta.isStream !== undefined
         ? Boolean(meta.isStream)
         : (row.endpoint ? !row.endpoint.includes("embeddings") : true);
       const keyName = apiKeyMap[row.api_key]?.name || (row.api_key ? maskApiKey(row.api_key) : "Default Key");
       const normalizedStatus = row.status || (meta.failed ? "error_502" : "ok");
       return {
        timestamp: ts,
        model: row.model,
        provider: row.provider || "",
        account: connectionMap[row.connection_id] || (row.provider === "opencode" ? "Direct (Free)" : row.provider || "Unknown"),
        connectionId: row.connection_id || null,
        apiKey: keyName,
        clientApiKey: keyName,
        rawApiKey: row.api_key || "",
        endpoint: row.endpoint || "/v1/chat/completions",
        isStream,
        promptTokens: tokens.prompt_tokens || tokens.input_tokens || 0,
        completionTokens: tokens.completion_tokens || tokens.output_tokens || 0,
        cachedTokens: tokens.cached_tokens || tokens.cache_read_input_tokens || 0,
         status: normalizedStatus,
        error: meta.error || null,
      };
    })
    .filter((entry) => {
       const isFailed = entry.status === "failed"
         || entry.status === "error"
         || String(entry.status || "").startsWith("error_");
      if (!isFailed && entry.status === "ok" && entry.promptTokens === 0 && entry.completionTokens === 0) return false;
      const sec = entry.timestamp ? entry.timestamp.slice(0, 19) : "";
       // Never collapse distinct failed attempts: at scale, repeated quota
       // failures are the signal operators need to see in Recent Requests.
       const key = isFailed
         ? `${entry.timestamp}|${entry.model}|${entry.provider}|${entry.connectionId || ""}|${entry.status}`
         : `${entry.model}|${entry.provider}|${entry.apiKey}|${entry.promptTokens}|${entry.completionTokens}|${sec}|${entry.status}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);

  const stats = {
    totalRequests: 0,
    totalFailedRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCachedTokens: 0,
    totalCost: 0,
    byProvider: {},
    byModel: {},
    byAccount: {},
    byApiKey: {},
    byEndpoint: {},
    last10Minutes: [],
    pending: pendingRequests,
    activeRequests: [],
    recentRequests,
    errorProvider: (Date.now() - lastErrorProvider.ts < 10000) ? lastErrorProvider.provider : "",
  };

  for (const [connectionId, models] of Object.entries(pendingRequests.byAccount)) {
    for (const [modelKey, count] of Object.entries(models)) {
      if (count > 0) {
        const accountName = connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
        const match = modelKey.match(/^(.*) \((.*)\)$/);
        stats.activeRequests.push({
          model: match ? match[1] : modelKey,
          provider: match ? match[2] : "unknown",
          account: accountName,
          connectionId,
          apiKey: "Default Key",
          clientApiKey: "Default Key",
          count,
        });
      }
    }
  }

  stats.last10Minutes = await getLast10Minutes(db);

  // usage_daily is the single source for every period: it is written by the
  // same batcher as usage_history but never had the recording gap, and it is
  // one row per day instead of one row per request.
  const useDailySummary = true;

  if (useDailySummary) {
    const periodDays = { "today": 1, "24h": 2, "7d": 7, "30d": 30, "60d": 60 };
    const maxDays = periodDays[period] || null;

    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - maxDays + 1);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

    const dayRows = maxDays == null
      ? await db.all(`SELECT date_key, data FROM usage_daily ORDER BY date_key ASC`)
      : await db.all(
          `SELECT date_key, data FROM usage_daily WHERE date_key >= $1 ORDER BY date_key ASC`,
          [cutoffKey],
        );
    const daySummaries = dayRows.map((row) => ({
      dateKey: String(row.date_key).slice(0, 10),
      ...((typeof row.data === "string" ? parseJson(row.data, {}) : row.data) ?? {}),
    }));
    const aggregated = buildAggregatesFromDays(daySummaries, connectionMap, providerNodeNameMap, apiKeyMap);
    Object.assign(stats, aggregated);
  } else {
    let cutoff;
    if (period === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      cutoff = startOfDay.toISOString();
    } else {
      cutoff = new Date(Date.now() - PERIOD_MS["24h"]).toISOString();
    }
    const filtered = await db.all(
      `SELECT timestamp, provider, model, connection_id, api_key, endpoint, prompt_tokens, completion_tokens, cost, tokens, status
       FROM usage_history WHERE timestamp >= $1`,
      [cutoff],
    );

    for (const r of filtered) {
      const rawTokens = r.tokens || {};
      const tokens = typeof rawTokens === "string" ? parseJson(rawTokens, {}) : rawTokens;
      const promptTokens = Number(r.prompt_tokens ?? tokens.prompt_tokens ?? tokens.input_tokens ?? 0);
      const completionTokens = Number(r.completion_tokens ?? tokens.completion_tokens ?? tokens.output_tokens ?? 0);
      const cachedTokens = Number(tokens.cached_tokens || tokens.cache_read_input_tokens || 0);
      const entryCost = Number(r.cost || 0);
      const providerDisplayName = providerNodeNameMap[r.provider] || r.provider;
        const isFailed = r.status === "failed"
          || r.status === "error"
          || String(r.status || "").startsWith("error_");
      if (isFailed) {
        stats.totalFailedRequests = (stats.totalFailedRequests || 0) + 1;
      }

      stats.totalPromptTokens += promptTokens;
      stats.totalCompletionTokens += completionTokens;
      stats.totalCachedTokens += cachedTokens;
      stats.totalCost += entryCost;

      if (!stats.byProvider[r.provider]) stats.byProvider[r.provider] = { requests: 0, failedRequests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
      stats.byProvider[r.provider].requests++;
      if (isFailed) stats.byProvider[r.provider].failedRequests = (stats.byProvider[r.provider].failedRequests || 0) + 1;
      stats.byProvider[r.provider].promptTokens += promptTokens;
      stats.byProvider[r.provider].completionTokens += completionTokens;
      stats.byProvider[r.provider].cachedTokens += cachedTokens;
      stats.byProvider[r.provider].cost += entryCost;

      const modelKey = r.provider ? `${r.model} (${r.provider})` : r.model;
      if (!stats.byModel[modelKey]) {
        stats.byModel[modelKey] = { requests: 0, failedRequests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, lastUsed: r.timestamp };
      }
      stats.byModel[modelKey].requests++;
      if (isFailed) stats.byModel[modelKey].failedRequests = (stats.byModel[modelKey].failedRequests || 0) + 1;
      stats.byModel[modelKey].promptTokens += promptTokens;
      stats.byModel[modelKey].completionTokens += completionTokens;
      stats.byModel[modelKey].cachedTokens += cachedTokens;
      stats.byModel[modelKey].cost += entryCost;
      if (new Date(r.timestamp) > new Date(stats.byModel[modelKey].lastUsed)) stats.byModel[modelKey].lastUsed = r.timestamp;

      if (r.connection_id) {
        const accountName = connectionMap[r.connection_id] || `Account ${r.connection_id.slice(0, 8)}...`;
        const accountKey = `${r.model} (${r.provider} - ${accountName})`;
        if (!stats.byAccount[accountKey]) {
          stats.byAccount[accountKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, connectionId: r.connection_id, accountName, lastUsed: r.timestamp };
        }
        stats.byAccount[accountKey].requests++;
        stats.byAccount[accountKey].promptTokens += promptTokens;
        stats.byAccount[accountKey].completionTokens += completionTokens;
        stats.byAccount[accountKey].cachedTokens += cachedTokens;
        stats.byAccount[accountKey].cost += entryCost;
        if (new Date(r.timestamp) > new Date(stats.byAccount[accountKey].lastUsed)) stats.byAccount[accountKey].lastUsed = r.timestamp;
      }

      if (r.api_key && typeof r.api_key === "string") {
        const keyInfo = apiKeyMap[r.api_key];
        const keyName = keyInfo?.name || r.api_key.slice(0, 8) + "...";
        const apiKeyMasked = maskApiKey(r.api_key);
        const akKey = `${apiKeyMasked}|${r.model}|${r.provider || "unknown"}`;
        if (!stats.byApiKey[akKey]) {
          stats.byApiKey[akKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, apiKeyMasked, keyName, apiKeyKey: apiKeyMasked, lastUsed: r.timestamp };
        }
        const ake = stats.byApiKey[akKey];
        ake.requests++; ake.promptTokens += promptTokens; ake.completionTokens += completionTokens; ake.cachedTokens += cachedTokens; ake.cost += entryCost;
        if (new Date(r.timestamp) > new Date(ake.lastUsed)) ake.lastUsed = r.timestamp;
      } else {
        if (!stats.byApiKey["local-no-key"]) {
          stats.byApiKey["local-no-key"] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, rawModel: r.model, provider: providerDisplayName, apiKeyMasked: null, keyName: "Local (No API Key)", apiKeyKey: "local-no-key", lastUsed: r.timestamp };
        }
        const ake = stats.byApiKey["local-no-key"];
        ake.requests++; ake.promptTokens += promptTokens; ake.completionTokens += completionTokens; ake.cachedTokens += cachedTokens; ake.cost += entryCost;
        if (new Date(r.timestamp) > new Date(ake.lastUsed)) ake.lastUsed = r.timestamp;
      }

      const endpoint = r.endpoint || "Unknown";
      const epKey = `${endpoint}|${r.model}|${r.provider || "unknown"}`;
      if (!stats.byEndpoint[epKey]) {
        stats.byEndpoint[epKey] = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, endpoint, rawModel: r.model, provider: providerDisplayName, lastUsed: r.timestamp };
      }
      const epe = stats.byEndpoint[epKey];
      epe.requests++; epe.promptTokens += promptTokens; epe.completionTokens += completionTokens; epe.cachedTokens += cachedTokens; epe.cost += entryCost;
      if (new Date(r.timestamp) > new Date(epe.lastUsed)) epe.lastUsed = r.timestamp;
    }
  }

  stats.totalRequests = Object.values(stats.byProvider).reduce((sum, p) => sum + (p.requests || 0), 0);
  stats.totalFailedRequests = Object.values(stats.byProvider).reduce((sum, p) => sum + (p.failedRequests || 0), 0);

  if (period === "24h") {
    // The daily window includes all of yesterday; drop the slice older than 24h.
    // usage_history is complete for that older slice (the recording gap is recent).
    const windowStart = new Date(Date.now() - PERIOD_MS["24h"]);
    const dayStart = new Date(windowStart);
    dayStart.setHours(0, 0, 0, 0);
    const stale = await db.get(
      `SELECT count(*)::int AS requests,
              COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt,
              COALESCE(SUM(completion_tokens), 0)::bigint AS completion,
              COALESCE(SUM(cost), 0)::float8 AS cost
       FROM usage_history WHERE timestamp >= $1 AND timestamp < $2`,
      [dayStart.toISOString(), windowStart.toISOString()],
    );
    if (stale && Number(stale.requests) > 0) {
      stats.totalRequests = Math.max(0, stats.totalRequests - Number(stale.requests));
      stats.totalPromptTokens = Math.max(0, stats.totalPromptTokens - Number(stale.prompt));
      stats.totalCompletionTokens = Math.max(0, stats.totalCompletionTokens - Number(stale.completion));
      stats.totalCost = Math.max(0, stats.totalCost - Number(stale.cost));
    }
  }

  return stats;
}

export async function getChartData(period = "7d") {
  const db = await getAdapter();
  const now = Date.now();

  if (period === "today") {
    const bucketCount = 24;
    const bucketMs = 3600000;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTime = startOfDay.getTime();
    const endTime = startTime + bucketCount * bucketMs;
    const labelFn = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({ label: labelFn(startTime + i * bucketMs), tokens: 0, cost: 0, requests: 0 }));

    const rows = await db.all(
      `SELECT timestamp, prompt_tokens, completion_tokens, cost FROM usage_history WHERE timestamp >= $1`,
      [new Date(startTime).toISOString()],
    );
    for (const row of rows) {
      const t = new Date(row.timestamp).getTime();
      if (t < startTime || t >= endTime) continue;
      const idx = Math.floor((t - startTime) / bucketMs);
      if (idx >= 0 && idx < bucketCount) {
        buckets[idx].tokens += Number(row.prompt_tokens || 0) + Number(row.completion_tokens || 0);
        buckets[idx].cost += Number(row.cost || 0);
        buckets[idx].requests += 1;
      }
    }
    return buckets;
  }

  if (period === "24h") {
    const bucketCount = 24;
    const bucketMs = 3600000;
    const labelFn = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const startTime = now - bucketCount * bucketMs;
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({ label: labelFn(startTime + i * bucketMs), tokens: 0, cost: 0, requests: 0 }));

    const rows = await db.all(
      `SELECT timestamp, prompt_tokens, completion_tokens, cost FROM usage_history WHERE timestamp >= $1`,
      [new Date(startTime).toISOString()],
    );
    for (const row of rows) {
      const t = new Date(row.timestamp).getTime();
      if (t < startTime) continue;
      const idx = Math.floor((t - startTime) / bucketMs);
      if (idx >= 0 && idx < bucketCount) {
        buckets[idx].tokens += Number(row.prompt_tokens || 0) + Number(row.completion_tokens || 0);
        buckets[idx].cost += Number(row.cost || 0);
        buckets[idx].requests += 1;
      }
    }
    return buckets;
  }

  const bucketCount = period === "7d" ? 7 : period === "30d" ? 30 : 60;
  const today = new Date();
  const labelFn = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - bucketCount + 1);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  const dayRows = await db.all(
    `SELECT date_key, data FROM usage_daily WHERE date_key >= $1 ORDER BY date_key ASC`,
    [cutoffKey],
  );
  const dayMap = {};
  for (const row of dayRows) {
    dayMap[row.date_key] = (typeof row.data === "string" ? parseJson(row.data, {}) : row.data) ?? {};
  }

  return Array.from({ length: bucketCount }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (bucketCount - 1 - i));
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayData = dayMap[dateKey];
    return {
      label: labelFn(d),
      tokens: dayData ? (dayData.promptTokens || 0) + (dayData.completionTokens || 0) : 0,
      cost: dayData ? (dayData.cost || 0) : 0,
      requests: dayData ? Number(dayData.requests || 0) : 0,
    };
  });
}

function formatLogDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// No-op: request log is now derived from usageHistory table on read.
export async function appendRequestLog() {}

export async function getRecentLogs(limit = 200) {
  try {
    const db = await getAdapter();
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const rows = await db.all(
      `SELECT timestamp, provider, model, connection_id, prompt_tokens, completion_tokens, status, tokens
       FROM usage_history ORDER BY id DESC LIMIT $1`,
      [safeLimit],
    );
    if (!rows.length) return [];

    const connMap = await getConnectionMapCached();

    return rows.map((row) => {
      const ts = formatLogDate(new Date(row.timestamp));
      const p = row.provider?.toUpperCase() || "-";
      const m = row.model || "-";
      const account = connMap[row.connection_id] || (row.connection_id ? row.connection_id.slice(0, 8) : "-");
      const tk = row.tokens ?? {};
      const sent = row.prompt_tokens ?? tk.prompt_tokens ?? "-";
      const received = row.completion_tokens ?? tk.completion_tokens ?? "-";
      const raw = `${ts} | ${m} | ${p} | ${account} | ${sent} | ${received} | ${row.status || "-"}`;
      return { datetime: ts, model: m, provider: p, account, sent: String(sent), received: String(received), status: row.status || "-", raw };
    });
  } catch (error) {
    console.error("[usageRepo] getRecentLogs failed:", error.message);
    return [];
  }
}

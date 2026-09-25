import postgres from "postgres";

export function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  // If user passes a Neon pooled endpoint, switch to direct compute endpoint
  // unless explicitly disabled with NEON_FORCE_POOLER=true.
  // Persistent Node/Hono worker clusters maintain their own pool; putting PgBouncer
  // in front adds double-pooling latency and breaks session-level Postgres features.
  if (process.env.NEON_FORCE_POOLER !== "true" && rawUrl.includes("neon.tech") && rawUrl.includes("-pooler")) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname && parsed.hostname.endsWith(".neon.tech") && parsed.hostname.includes("-pooler")) {
        parsed.hostname = parsed.hostname.replace("-pooler", "");
        return parsed.toString();
      }
    } catch {
      return rawUrl.replace(/-pooler(\.[a-zA-Z0-9.-]+\.neon\.tech|\.neon\.tech)/gi, "$1");
    }
  }
  return rawUrl;
}

// Singleton pool on global so re-imports (dev, tests) don't open a second pool
if (!global._pgSql) {
  const rawConnectionString = process.env.DATABASE_URL || "postgres://axonrouter:password123@localhost:5432/axonrouter";
  const connectionString = normalizeDatabaseUrl(rawConnectionString);
  const isPooler = connectionString.includes("-pooler") || connectionString.includes(":6543") || connectionString.includes("pgbouncer");
  if (connectionString !== rawConnectionString && process.env.NODE_ENV !== "test") {
    console.log("[DB] Neon URL detected with pooler: automatically converted to direct compute endpoint.");
  }
  // Postgres crashes (OOM-kill, host restart) leave idle pooled connections
  // half-dead; postgres.js only detects them on next use. A short idle
  // timeout + connection lifetime bound recovers the pool without a manual
  // app restart. max_lifetime < 30min keeps the pool churning through a
  // server reboot within one lifecycle.
  global._pgSql = postgres(connectionString, {
    prepare: !isPooler,
    // Tunable to match MAX_CONCURRENT_UPSTREAM: a 128-wide upstream semaphore
    // behind a 25-connection pool queues inside the DB layer at peak.
    max: Number(process.env.PG_POOL_MAX) || 25,
    // Remote DB (e.g. Neon): keep TLS sessions warm — PG_IDLE_TIMEOUT covers
    // neon auto-suspend; PG_MAX_LIFETIME bounds connection churn.
    idle_timeout: Number(process.env.PG_IDLE_TIMEOUT) || 10,
    connect_timeout: Number(process.env.PG_CONNECT_TIMEOUT) || 5,
    max_lifetime: Number(process.env.PG_MAX_LIFETIME) || 60 * 10,
    types: {
      numeric: {
        to: 0,
        from: [1700],
        serialize: (x) => "" + x,
        parse: (x) => (x === null ? null : parseFloat(x)),
      },
      bigint: {
        to: 20,
        from: [20],
        serialize: (x) => "" + x,
        parse: (x) => (x === null ? null : Number(x)),
      },
      timestamptz: {
        to: 1184,
        from: [1184],
        serialize: (x) => (x instanceof Date ? x.toISOString() : "" + x),
        parse: (x) => (x === null ? null : (new Date(x)).toISOString()),
      },
      timestamp: {
        to: 1114,
        from: [1114],
        serialize: (x) => (x instanceof Date ? x.toISOString() : "" + x),
        parse: (x) => (x === null ? null : (new Date(x)).toISOString()),
      },
      date: {
        to: 1082,
        from: [1082],
        serialize: (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : "" + x),
        parse: (x) => (x === null ? null : String(x).slice(0, 10)),
      },
    },
    transform: {
      undefined: null,
    },
    // Pool-level error hook: a connection killed mid-query (server crash,
    // recovery restart) surfaces here. postgres.js already drops the dead
    // socket; logging makes the recovery visible in console logs instead of
    // surfacing as a silent 503 on the next request.
    onnotice: (n) => { if (n.severity === "ERROR" || n.severity === "FATAL") console.warn("[pg]", n.message); },
  });
}

const sql = global._pgSql;

// Graceful pool close on shutdown
function gracefulClose() {
  if (global._pgSql) {
    try {
      global._pgSql.end({ timeout: 5 }).catch(() => {});
    } catch {}
  }
}

process.once("beforeExit", gracefulClose);
process.once("SIGINT", () => { gracefulClose(); process.exit(0); });
process.once("SIGTERM", () => { gracefulClose(); process.exit(0); });

export function createPostgresAdapter() {
  return {
    driver: "postgres",
    raw: sql,

    async run(query, params = []) {
      if (params.length === 0) {
        const result = await sql.unsafe(query);
        return { changes: result.count, lastInsertRowid: result[0]?.id || null };
      }
      const result = await sql.unsafe(query, params);
      return { changes: result.count, lastInsertRowid: result[0]?.id || null };
    },

    async get(query, params = []) {
      const rows = await sql.unsafe(query, params);
      return rows[0] || null;
    },

    async all(query, params = []) {
      const rows = await sql.unsafe(query, params);
      return rows;
    },

    async exec(rawSql) {
      return await sql.unsafe(rawSql);
    },

    async transaction(fn) {
      return await sql.begin(async (tx) => {
        const txAdapter = {
          driver: "postgres",
          raw: tx,
          async run(q, p = []) {
            const res = await tx.unsafe(q, p);
            return { changes: res.count, lastInsertRowid: res[0]?.id || null };
          },
          async get(q, p = []) {
            const rows = await tx.unsafe(q, p);
            return rows[0] || null;
          },
          async all(q, p = []) {
            return await tx.unsafe(q, p);
          },
          async exec(raw) {
            return await tx.unsafe(raw);
          },
        };
        return await fn(txAdapter);
      });
    },

    async close() {
      gracefulClose();
    },
  };
}

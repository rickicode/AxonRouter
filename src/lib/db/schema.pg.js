export const PG_SCHEMA_SQL = `
-- Metadata Schema Versioning
-- Safe timestamptz cast for legacy/junk lock values (PG 15 has no
-- pg_input_is_valid; prod PG 17 has it but the schema must run on both).
CREATE OR REPLACE FUNCTION safe_input_timestamptz(v TEXT) RETURNS TIMESTAMPTZ AS $fn$
  BEGIN
    RETURN v::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
$fn$ LANGUAGE plpgsql IMMUTABLE;
-- Text that looks like JSON ("{not-valid-json") but fails to parse must be
-- left alone, never abort the whole bootstrap transaction.
CREATE OR REPLACE FUNCTION safe_input_jsonb(v TEXT) RETURNS JSONB AS $fn$
  BEGIN
    RETURN v::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
$fn$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Provider Connections
CREATE TABLE IF NOT EXISTS provider_connections (
  id TEXT PRIMARY KEY,
  provider VARCHAR(64) NOT NULL,
  auth_type VARCHAR(32) NOT NULL,
  name TEXT,
  email TEXT,
  priority INTEGER DEFAULT 999,
  is_active BOOLEAN DEFAULT TRUE,
  test_status VARCHAR(32) DEFAULT 'active',
  locked_all_until TIMESTAMPTZ,
  rate_limited_until TIMESTAMPTZ,
  locked_to_model TEXT,
  locked_to_model_until TIMESTAMPTZ,
  token_expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  model_locks JSONB DEFAULT '{}'::jsonb,
  last_error TEXT,
  error_code TEXT,
  last_error_at TIMESTAMPTZ,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE provider_connections ADD COLUMN IF NOT EXISTS locked_to_model TEXT;
ALTER TABLE provider_connections ADD COLUMN IF NOT EXISTS locked_to_model_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pc_model_locks ON provider_connections USING GIN (model_locks);
CREATE INDEX IF NOT EXISTS idx_pc_token_refresh ON provider_connections (provider, token_expires_at)
WHERE is_active = true AND token_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pc_provider_active ON provider_connections (provider, is_active);
CREATE INDEX IF NOT EXISTS idx_pc_provider_auth ON provider_connections (provider, auth_type);
CREATE INDEX IF NOT EXISTS idx_pc_routing_v2
  ON provider_connections (provider, priority ASC NULLS LAST, last_used_at ASC NULLS FIRST, id)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pc_oauth_refresh_due
  ON provider_connections (token_expires_at, id)
  WHERE is_active = true AND auth_type = 'oauth' AND token_expires_at IS NOT NULL;

-- Provider Nodes
CREATE TABLE IF NOT EXISTS provider_nodes (
  id TEXT PRIMARY KEY,
  type TEXT,
  name TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quota & Usage Snapshots
CREATE TABLE IF NOT EXISTS usage_snapshots (
  connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL,
  plan TEXT,
  quotas JSONB NOT NULL,
  rate_limits JSONB,
  remaining_pct NUMERIC,
  raw_dosage NUMERIC,
  reset_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_snap_provider ON usage_snapshots (provider);
CREATE INDEX IF NOT EXISTS idx_usage_snap_reset ON usage_snapshots (reset_at);
CREATE INDEX IF NOT EXISTS idx_usage_snap_provider_quota
  ON usage_snapshots (provider, remaining_pct ASC NULLS LAST, updated_at DESC);

-- Proxy Pools
CREATE TABLE IF NOT EXISTS proxy_pools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  proxy_url TEXT NOT NULL,
  no_proxy TEXT DEFAULT '',
  type VARCHAR(32) DEFAULT 'http',
  "group" VARCHAR(64) DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  strict_proxy BOOLEAN DEFAULT FALSE,
  test_status VARCHAR(32) DEFAULT 'unknown',
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pp_group ON proxy_pools ("group") WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pp_active ON proxy_pools (is_active);

-- Proxy Groups
CREATE TABLE IF NOT EXISTS proxy_groups (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  is_sticky BOOLEAN DEFAULT FALSE,
  sticky_limit INTEGER DEFAULT 3,
  pool_ids JSONB DEFAULT '[]'::jsonb,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pg_name ON proxy_groups (name);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT,
  machine_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ak_key ON api_keys (key);

-- Combos
CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  kind TEXT,
  models JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_combos_name ON combos (name);
ALTER TABLE combos ADD COLUMN IF NOT EXISTS context_window INTEGER DEFAULT 250000;
ALTER TABLE combos ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 32768;

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Distributed Active Requests (cross-worker, cross-container shared state)
CREATE TABLE IF NOT EXISTS active_requests (
  request_id VARCHAR(128) PRIMARY KEY,
  model VARCHAR(128) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  connection_id VARCHAR(64),
  api_key VARCHAR(128),
  is_stream BOOLEAN DEFAULT true,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '120 seconds')
);
CREATE INDEX IF NOT EXISTS idx_active_requests_lookup ON active_requests (expires_at, started_at DESC);


-- Auto-seed default settings & master password (12345677) on initial install
INSERT INTO settings (id, data, updated_at)
VALUES (
  1,
  '{"password": "$2b$10$xrgcy0aGADW76p.8smKPIeT8p/7F7pNr5z35TRhP366LIqFTOrfiy", "requireLogin": true, "authMode": "password"}'::jsonb,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- If row exists but password is null or empty, seed default password 12345677
UPDATE settings
SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{password}', '"$2b$10$xrgcy0aGADW76p.8smKPIeT8p/7F7pNr5z35TRhP366LIqFTOrfiy"')
WHERE id = 1 AND (data->>'password' IS NULL OR data->>'password' = '');

-- Model benchmark history. Attempts are facts. Reports are reviewer text.
CREATE TABLE IF NOT EXISTS benchmark_jobs (
  id UUID PRIMARY KEY,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  providers JSONB NOT NULL DEFAULT '[]'::jsonb,
  suites JSONB NOT NULL DEFAULT '["pong"]'::jsonb,
  reviewer VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_benchmark_jobs_created ON benchmark_jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS benchmark_attempts (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES benchmark_jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(64) NOT NULL,
  connection_id TEXT,
  account_name TEXT,
  model VARCHAR(256) NOT NULL,
  suite VARCHAR(32) NOT NULL,
  rep SMALLINT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL,
  http_status INTEGER,
  format VARCHAR(16),
  ttft_ms DOUBLE PRECISION,
  total_ms DOUBLE PRECISION,
  tokens INTEGER,
  tps DOUBLE PRECISION,
  score INTEGER,
  excerpt TEXT,
  request_body TEXT,
  response_body TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_benchmark_attempts_job ON benchmark_attempts (job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_benchmark_attempts_day ON benchmark_attempts (created_at DESC, provider, model);
ALTER TABLE benchmark_attempts ADD COLUMN IF NOT EXISTS request_body TEXT;
ALTER TABLE benchmark_attempts ADD COLUMN IF NOT EXISTS response_body TEXT;

CREATE TABLE IF NOT EXISTS benchmark_reports (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES benchmark_jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewer VARCHAR(256) NOT NULL,
  report TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_benchmark_reports_job ON benchmark_reports (job_id, created_at DESC);

-- KV Store
CREATE TABLE IF NOT EXISTS kv (
  scope VARCHAR(64) NOT NULL,
  key VARCHAR(128) NOT NULL,
  value JSONB NOT NULL,
  PRIMARY KEY (scope, key)
);
CREATE INDEX IF NOT EXISTS idx_kv_scope ON kv (scope);

-- Partitioned Request Details
CREATE TABLE IF NOT EXISTS request_details (
  id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(64),
  model VARCHAR(128),
  connection_id TEXT,
  status VARCHAR(32),
  data JSONB NOT NULL,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Partitioned Usage History
CREATE TABLE IF NOT EXISTS usage_history (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(64),
  model VARCHAR(128),
  connection_id TEXT,
  api_key TEXT,
  endpoint TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  status VARCHAR(32),
  tokens JSONB,
  meta JSONB,
  request_id TEXT,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);
-- Idempotency key for usage writes: concurrent completion callbacks (stream
-- close + completion, retry paths) must not double-count one upstream attempt.
-- Nullable so pre-migration rows are unaffected (PostgreSQL allows many NULLs
-- in a UNIQUE index); new writes always set it.
ALTER TABLE usage_history ADD COLUMN IF NOT EXISTS request_id TEXT;
-- Composite with the partition key: PostgreSQL requires unique indexes on
-- partitioned tables to include it. NULL request_ids (pre-migration rows)
-- never conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_uh_request_id ON usage_history (request_id, timestamp);

-- Forward-compatible PostgreSQL migrations for databases created before the
-- current usage schema. CREATE TABLE IF NOT EXISTS does not add new columns.
ALTER TABLE usage_history ADD COLUMN IF NOT EXISTS connection_id TEXT;
ALTER TABLE usage_history ADD COLUMN IF NOT EXISTS api_key TEXT;
ALTER TABLE usage_history ADD COLUMN IF NOT EXISTS endpoint TEXT;
ALTER TABLE usage_history ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0;
ALTER TABLE usage_history ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;
ALTER TABLE usage_history ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0;
ALTER TABLE usage_history ADD COLUMN IF NOT EXISTS status VARCHAR(32);
ALTER TABLE usage_history ADD COLUMN IF NOT EXISTS tokens JSONB;
ALTER TABLE usage_history ADD COLUMN IF NOT EXISTS meta JSONB;

-- Daily Usage Aggregates
CREATE TABLE IF NOT EXISTS usage_daily (
  date_key DATE PRIMARY KEY,
  data JSONB NOT NULL
);
`;

/**
 * One-time repair for legacy / imported scalar strings into valid JSONB objects.
 * Version-gated via _meta to prevent table-wide scans on every bootstrap.
 */
export async function repairLegacyJsonbOnce(adapter) {
  const migrated = await adapter.get("SELECT value FROM _meta WHERE key = 'legacy_jsonb_repaired'");
  if (migrated?.value === "true") return;

  await adapter.exec(`
    UPDATE provider_connections
       SET data = safe_input_jsonb(data #>> '{}')
     WHERE jsonb_typeof(data) = 'string'
       AND (data #>> '{}') LIKE '{%'
       AND safe_input_jsonb(data #>> '{}') IS NOT NULL;

    UPDATE provider_connections
       SET model_locks = safe_input_jsonb(model_locks #>> '{}')
     WHERE jsonb_typeof(model_locks) = 'string'
       AND (model_locks #>> '{}') LIKE '{%'
       AND safe_input_jsonb(model_locks #>> '{}') IS NOT NULL;

    UPDATE combos
       SET models = safe_input_jsonb(models #>> '{}')
     WHERE jsonb_typeof(models) = 'string'
       AND (models #>> '{}') LIKE '[%'
       AND safe_input_jsonb(models #>> '{}') IS NOT NULL;

    UPDATE proxy_groups
       SET pool_ids = safe_input_jsonb(pool_ids #>> '{}')
     WHERE jsonb_typeof(pool_ids) = 'string'
       AND (pool_ids #>> '{}') LIKE '[%'
       AND safe_input_jsonb(pool_ids #>> '{}') IS NOT NULL;

    UPDATE proxy_groups
       SET data = safe_input_jsonb(data #>> '{}')
     WHERE jsonb_typeof(data) = 'string'
       AND (data #>> '{}') LIKE '{%'
       AND safe_input_jsonb(data #>> '{}') IS NOT NULL;

    UPDATE settings
       SET data = safe_input_jsonb(data #>> '{}')
     WHERE jsonb_typeof(data) = 'string'
       AND (data #>> '{}') LIKE '{%'
       AND safe_input_jsonb(data #>> '{}') IS NOT NULL;

    UPDATE provider_nodes
       SET data = safe_input_jsonb(data #>> '{}')
     WHERE jsonb_typeof(data) = 'string'
       AND (data #>> '{}') LIKE '{%'
       AND safe_input_jsonb(data #>> '{}') IS NOT NULL;

    UPDATE proxy_pools
       SET data = safe_input_jsonb(data #>> '{}')
     WHERE jsonb_typeof(data) = 'string'
       AND (data #>> '{}') LIKE '{%'
       AND safe_input_jsonb(data #>> '{}') IS NOT NULL;

    UPDATE usage_snapshots
       SET quotas = safe_input_jsonb(quotas #>> '{}')
     WHERE jsonb_typeof(quotas) = 'string'
       AND (quotas #>> '{}') LIKE '{%'
       AND safe_input_jsonb(quotas #>> '{}') IS NOT NULL;

    UPDATE usage_snapshots
       SET rate_limits = NULL
     WHERE rate_limits = '"null"'::jsonb OR rate_limits = to_jsonb('null'::text);

    UPDATE request_details
       SET data = safe_input_jsonb(data #>> '{}')
     WHERE jsonb_typeof(data) = 'string'
       AND (data #>> '{}') LIKE '{%'
       AND safe_input_jsonb(data #>> '{}') IS NOT NULL;

    UPDATE usage_history
       SET tokens = safe_input_jsonb(tokens #>> '{}')
     WHERE jsonb_typeof(tokens) = 'string'
       AND (tokens #>> '{}') LIKE '{%'
       AND safe_input_jsonb(tokens #>> '{}') IS NOT NULL;

    UPDATE usage_history
       SET meta = safe_input_jsonb(meta #>> '{}')
     WHERE jsonb_typeof(meta) = 'string'
       AND (meta #>> '{}') LIKE '{%'
       AND safe_input_jsonb(meta #>> '{}') IS NOT NULL;

    INSERT INTO _meta (key, value) VALUES ('legacy_jsonb_repaired', 'true')
    ON CONFLICT (key) DO UPDATE SET value = 'true';
  `);
}

/**
 * Ensure a rolling UTC partition window exists. The one-month lookback keeps
 * delayed writes/imports safe; six months ahead avoids deploy-boundary gaps.
 */
export async function ensureMonthlyPartitions(adapter) {
  const dates = [];
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  for (let i = -1; i <= 6; i += 1) {
    dates.push(new Date(Date.UTC(year, month + i, 1)));
  }

  // Existing partitions carry the deployment's boundary timezone (+07 on the
  // self-hosted stack, +00 on Neon). New bounds must reuse that exact
  // time+offset, otherwise the chain gets a 7-hour gap/overlap and inserts
  // fail with "no partition found" / "would be overlapped".
  const existing = await adapter.get(
    `SELECT pg_get_expr(c.relpartbound, c.oid) AS bound
       FROM pg_class c
       JOIN pg_inherits i ON i.inhrelid = c.oid
      WHERE i.inhparent = 'public.usage_history'::regclass
      ORDER BY c.relname DESC
      LIMIT 1`
  );
  const upperMatch = existing?.bound?.match(/TO \('\d{4}-\d{2}-\d{2} ([^']+)'\)/);
  const timePart = upperMatch ? upperMatch[1] : "00:00:00+00";

  for (let i = 0; i < dates.length - 1; i++) {
    const start = dates[i];
    const end = dates[i + 1];
    const suffix = `y${start.getUTCFullYear()}m${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    const startStr = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01 ${timePart}`;
    const endStr = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-01 ${timePart}`;
    const rdSql = `CREATE TABLE IF NOT EXISTS request_details_${suffix} PARTITION OF request_details FOR VALUES FROM ('${startStr}') TO ('${endStr}');`;
    const uhSql = `CREATE TABLE IF NOT EXISTS usage_history_${suffix} PARTITION OF usage_history FOR VALUES FROM ('${startStr}') TO ('${endStr}');`;

    await adapter.exec(rdSql);
    await adapter.exec(uhSql);

    // Performance indexes per partition for high-speed dashboard analytics
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_rd_${suffix}_ts ON request_details_${suffix} (timestamp DESC);`);
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_rd_${suffix}_prov ON request_details_${suffix} (provider, timestamp DESC);`);
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_uh_${suffix}_lookup ON usage_history_${suffix} (timestamp DESC, id DESC);`);
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_uh_${suffix}_status ON usage_history_${suffix} (status, timestamp DESC);`);
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_uh_${suffix}_prov ON usage_history_${suffix} (provider, timestamp DESC);`);
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_uh_${suffix}_model ON usage_history_${suffix} (model, timestamp DESC);`);
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_rd_${suffix}_conn ON request_details_${suffix} (connection_id, timestamp DESC);`);
  }
}

/**
 * Drop partitions older than retainMonths to keep PostgreSQL storage bounded.
 */
export async function pruneStalePartitions(adapter, retainMonths = 3) {
  try {
    const db = adapter || (await import("./driver.js")).getAdapter ? await (await import("./driver.js")).getAdapter() : adapter;
    if (!db) return;
    const now = new Date();
    const cutoffDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - retainMonths, 1));
    const cutoffSuffix = `y${cutoffDate.getUTCFullYear()}m${String(cutoffDate.getUTCMonth() + 1).padStart(2, "0")}`;

    const rows = await db.all(
      `SELECT c.relname
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = current_schema()
          AND (c.relname LIKE 'request_details_y%' OR c.relname LIKE 'usage_history_y%')`
    );

    for (const r of (rows || [])) {
      const match = r.relname.match(/(request_details|usage_history)_(y\d{4}m\d{2})/);
      if (match && match[2] < cutoffSuffix) {
        await db.exec(`DROP TABLE IF EXISTS ${r.relname} CASCADE;`);
      }
    }
  } catch (err) {
    // Fail-open: partition pruning should never crash startup
  }
}


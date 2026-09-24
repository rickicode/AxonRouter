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

CREATE INDEX IF NOT EXISTS idx_pc_routing ON provider_connections (provider, priority, last_used_at NULLS FIRST)
WHERE is_active = true;

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

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Auto-repair legacy / imported scalar strings into valid JSONB objects.
-- Runs after every CREATE TABLE: on an empty database the target tables
-- would not exist yet and the whole bootstrap transaction would fail.
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
`;

/**
 * Ensure a rolling UTC partition window exists. The one-month lookback keeps
 * delayed writes/imports safe; six months ahead avoids deploy-boundary gaps.
 */
export async function ensureMonthlyPartitions(adapter) {
  const dates = [];
  const now = new Date();
  const month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  for (let i = -1; i <= 6; i += 1) {
    const date = new Date(month);
    date.setUTCMonth(date.getUTCMonth() + i);
    dates.push(date);
  }

  for (let i = 0; i < dates.length - 1; i++) {
    const start = dates[i];
    const end = dates[i + 1];
    const suffix = `y${start.getFullYear()}m${String(start.getMonth() + 1).padStart(2, "0")}`;
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`;

    const rdSql = `CREATE TABLE IF NOT EXISTS request_details_${suffix} PARTITION OF request_details FOR VALUES FROM ('${startStr}') TO ('${endStr}');`;
    const uhSql = `CREATE TABLE IF NOT EXISTS usage_history_${suffix} PARTITION OF usage_history FOR VALUES FROM ('${startStr}') TO ('${endStr}');`;

    await adapter.exec(rdSql);
    await adapter.exec(uhSql);

    // Performance indexes per partition for high-speed dashboard analytics
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_rd_${suffix}_ts ON request_details_${suffix} (timestamp DESC);`);
    await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_rd_${suffix}_prov ON request_details_${suffix} (provider, timestamp DESC);`);
     await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_uh_${suffix}_lookup ON usage_history_${suffix} (timestamp DESC, id DESC);`);
     await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_uh_${suffix}_status ON usage_history_${suffix} (status, timestamp DESC);`);
     await adapter.exec(`CREATE INDEX IF NOT EXISTS idx_rd_${suffix}_conn ON request_details_${suffix} (connection_id, timestamp DESC);`);
  }
}

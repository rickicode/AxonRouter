CREATE TABLE IF NOT EXISTS usage_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  normalized_model TEXT,
  connection_id TEXT,
  account_name_cache TEXT,
  api_key_id TEXT,
  api_key_name_cache TEXT,
  api_key_value_hash TEXT,
  endpoint TEXT,
  status TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_cache_read INTEGER NOT NULL DEFAULT 0,
  tokens_cache_creation INTEGER NOT NULL DEFAULT 0,
  tokens_reasoning INTEGER NOT NULL DEFAULT 0,
  cost_total REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  ttft_ms INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'general',
  category TEXT,
  cloud_worker_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usage_daily_summary (
  date TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  normalized_model TEXT NOT NULL DEFAULT '',
  connection_id TEXT NOT NULL DEFAULT '',
  account_name_cache TEXT NOT NULL DEFAULT '',
  api_key_id TEXT NOT NULL DEFAULT '',
  api_key_name_cache TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'general',
  requests INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_total REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (
    date,
    provider,
    model,
    connection_id,
    api_key_id,
    endpoint,
    source
  )
);

CREATE TABLE IF NOT EXISTS usage_request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  request_id TEXT,
  provider TEXT,
  model TEXT,
  connection_id TEXT,
  status TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  source TEXT NOT NULL DEFAULT 'general',
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS usage_writer_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider_timestamp ON usage_events(provider, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_model_timestamp ON usage_events(model, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_connection_timestamp ON usage_events(connection_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_api_key_timestamp ON usage_events(api_key_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_source_timestamp ON usage_events(source, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_status_timestamp ON usage_events(status, timestamp);

CREATE INDEX IF NOT EXISTS idx_usage_daily_summary_date ON usage_daily_summary(date);
CREATE INDEX IF NOT EXISTS idx_usage_daily_summary_provider_date ON usage_daily_summary(provider, date);
CREATE INDEX IF NOT EXISTS idx_usage_daily_summary_model_date ON usage_daily_summary(model, date);
CREATE INDEX IF NOT EXISTS idx_usage_daily_summary_connection_date ON usage_daily_summary(connection_id, date);
CREATE INDEX IF NOT EXISTS idx_usage_daily_summary_api_key_date ON usage_daily_summary(api_key_id, date);
CREATE INDEX IF NOT EXISTS idx_usage_daily_summary_source_date ON usage_daily_summary(source, date);

CREATE INDEX IF NOT EXISTS idx_usage_request_logs_timestamp ON usage_request_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_request_logs_status_timestamp ON usage_request_logs(status, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_request_logs_request_id ON usage_request_logs(request_id);

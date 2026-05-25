CREATE TABLE IF NOT EXISTS request_details_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS request_details_index (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  connection_id TEXT,
  endpoint TEXT,
  status TEXT,
  latency_ttft_ms INTEGER NOT NULL DEFAULT 0,
  latency_total_ms INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  has_request_payload INTEGER NOT NULL DEFAULT 0,
  has_response_payload INTEGER NOT NULL DEFAULT 0,
  request_payload_path TEXT,
  provider_request_payload_path TEXT,
  provider_response_payload_path TEXT,
  response_payload_path TEXT,
  error_summary TEXT,
  payload_truncated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_request_details_timestamp ON request_details_index(timestamp);
CREATE INDEX IF NOT EXISTS idx_request_details_provider_timestamp ON request_details_index(provider, timestamp);
CREATE INDEX IF NOT EXISTS idx_request_details_model_timestamp ON request_details_index(model, timestamp);
CREATE INDEX IF NOT EXISTS idx_request_details_status_timestamp ON request_details_index(status, timestamp);
CREATE INDEX IF NOT EXISTS idx_request_details_connection_timestamp ON request_details_index(connection_id, timestamp);

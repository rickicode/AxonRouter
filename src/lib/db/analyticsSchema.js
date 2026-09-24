// New events only. No migration/backfill from usage_history or request_details.
export const ANALYTICS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(256) NOT NULL,
  success BOOLEAN NOT NULL,
  latency_ms DOUBLE PRECISION CHECK (latency_ms >= 0 AND latency_ms < 'Infinity'::float8),
  input_tokens BIGINT CHECK (input_tokens >= 0),
  output_tokens BIGINT CHECK (output_tokens >= 0),
  error_category VARCHAR(32) CHECK (error_category IN ('upstream','rate_limit','auth','timeout','cancelled','stream','internal','unknown')),
  CHECK ((success AND error_category IS NULL) OR (NOT success AND error_category IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_analytics_time ON analytics_events (timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_provider_model_time ON analytics_events (provider, model, timestamp);
`;

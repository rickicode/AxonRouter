ALTER TABLE request_details_index ADD COLUMN correlation_id TEXT;
ALTER TABLE request_details_index ADD COLUMN trace_mode TEXT;
ALTER TABLE request_details_index ADD COLUMN trace_event_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE request_details_index ADD COLUMN trace_last_event_type TEXT;

CREATE INDEX IF NOT EXISTS idx_request_details_correlation_timestamp ON request_details_index(correlation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_request_details_trace_mode_timestamp ON request_details_index(trace_mode, timestamp);
CREATE INDEX IF NOT EXISTS idx_request_details_trace_last_event_timestamp ON request_details_index(trace_last_event_type, timestamp);

ALTER TABLE usage_events ADD COLUMN total_tokens INTEGER;

UPDATE usage_events
SET total_tokens = tokens_input + tokens_output + tokens_cache_read + tokens_cache_creation + tokens_reasoning
WHERE total_tokens IS NULL;

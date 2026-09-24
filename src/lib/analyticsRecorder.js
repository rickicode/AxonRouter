import { recordAnalyticsEvent } from "./db/repos/analyticsRepo.js";

// One recorder per routed attempt. Never retain bodies, headers or credentials.
export function createAnalyticsRecorder(
  { provider, model },
  sink = recordAnalyticsEvent,
  now = Date.now,
) {
  const started = now();
  let done = false;
  let tokens = null;
  return {
    usage(value) {
      if (done || !value) return;
      tokens = {
        input_tokens:
          value.input_tokens ??
          value.prompt_tokens ??
          null ??
          tokens?.input_tokens ??
          null,
        output_tokens:
          value.output_tokens ??
          value.completion_tokens ??
          null ??
          tokens?.output_tokens ??
          null,
      };
    },
    finish(success, details = {}) {
      if (done) return;
      done = true;
      try {
        Promise.resolve(
          sink({
            provider,
            model,
            success,
            latency_ms: Math.max(0, now() - started),
            ...tokens,
            status: details.status,
            error: details.error,
            error_category: details.error_category,
          }),
        ).catch(() => {});
      } catch {
        /* Analytics must never affect inference. */
      }
    },
  };
}

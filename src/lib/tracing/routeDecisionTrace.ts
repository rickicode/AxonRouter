function redactValue(value: unknown) {
  if (typeof value !== "string") return value;
  if (value.length <= 12) return "[redacted]";
  return `${value.slice(0, 4)}...[redacted]...${value.slice(-2)}`;
}

export function sanitizeTracePayload(payload: any = {}) {
  const clone: Record<string, unknown> = { ...payload };
  for (const key of Object.keys(clone)) {
    const lowered = key.toLowerCase();
    if (lowered.includes("prompt") || lowered.includes("token") || lowered.includes("authorization") || lowered.includes("api_key")) {
      clone[key] = redactValue(String(clone[key] ?? ""));
    }
  }
  return clone;
}

export function createRouteTrace({ correlationId, mode, requestedModel }: any = {}) {
  return {
    correlation_id: correlationId,
    mode: mode || "text",
    requestedModel: requestedModel || null,
    startedAt: new Date().toISOString(),
    events: [],
  };
}

export function appendRouteTraceEvent(trace: any, type: string, payload: any = {}) {
  if (!trace || !Array.isArray(trace.events)) return trace;
  trace.events.push({
    type,
    timestamp: new Date().toISOString(),
    payload: sanitizeTracePayload(payload),
  });
  return trace;
}

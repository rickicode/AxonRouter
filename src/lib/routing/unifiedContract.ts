import { getProvidersByKind } from "@/shared/constants/providers";
import { saveRequestDetail } from "@/lib/usageDb";
import { appendRouteTraceEvent, createRouteTrace } from "@/lib/tracing/routeDecisionTrace";
import { createFallbackGraph, evaluateFallbackGraph, recordFallbackVisit } from "@/lib/routing/fallbackGraph";

export const UNIFIED_MODALITY_ENDPOINT = "/v1/unified";

export const UNIFIED_MODALITIES = {
  text: {
    mode: "text",
    capability: "llm",
    targetPath: "/v1/chat/completions",
    requestFields: ["model", "messages|input", "stream?", "tools?"],
    responseShape: ["mode", "provider", "model", "usage", "correlation_id", "output"],
  },
  image: {
    mode: "image",
    capability: "image",
    targetPath: "/v1/images/generations",
    requestFields: ["model", "prompt", "size?", "n?"],
    responseShape: ["mode", "provider", "model", "usage", "correlation_id", "data"],
  },
  audio: {
    mode: "audio",
    capability: "tts",
    targetPath: "/v1/audio/speech",
    requestFields: ["model", "input", "voice?", "format?"],
    responseShape: ["mode", "provider", "model", "usage", "correlation_id", "data|output"],
  },
  video: {
    mode: "video",
    capability: "video",
    targetPath: "/v1/video/generations",
    requestFields: ["model", "prompt", "duration?", "size?"],
    responseShape: ["mode", "provider", "model", "usage", "correlation_id", "data"],
  },
};

export function getUnifiedModeConfig(mode) {
  if (typeof mode !== "string") return null;
  return UNIFIED_MODALITIES[mode] || null;
}

export function getProviderSupportedModes(provider) {
  const serviceKinds = provider?.serviceKinds ?? ["llm"];
  const modes = [];
  if (serviceKinds.includes("llm")) modes.push("text");
  if (serviceKinds.includes("image")) modes.push("image");
  if (serviceKinds.includes("tts")) modes.push("audio");
  if (serviceKinds.includes("video")) modes.push("video");
  return modes;
}

export function getUnifiedModeProviders(mode) {
  const config = getUnifiedModeConfig(mode);
  if (!config) return [];
  return config.capability === "llm"
    ? getProvidersByKind("llm")
    : getProvidersByKind(config.capability);
}

export function buildCorrelationId() {
  return `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function dispatchUnifiedModality({ request, mode, correlationId, requestBody = null }) {
  const config = getUnifiedModeConfig(mode);
  const trace = createRouteTrace({ correlationId, mode, requestedModel: requestBody?.model || null });
  if (!config) {
    appendRouteTraceEvent(trace, "reject", { reason: "unsupported_mode", mode });
    return Response.json({
      error: `Unsupported mode: ${String(mode)}`,
      code: "unsupported_mode",
    }, { status: 400, headers: { "x-correlation-id": correlationId } });
  }

  // Video uses a baseline first-class route even if provider integrations are still shallow.

  const url = new URL(request.url);
  url.pathname = config.targetPath;

  const fallbackGraph = createFallbackGraph({
    primary: { id: `${mode}:primary`, provider: null, model: requestBody?.model || null },
    fallbacks: [],
    budgets: { maxHops: 1, retryBudget: 0 },
  } as any);
  let fallbackState = { visited: [], hops: 0, retryCount: 0 };
  const decision = evaluateFallbackGraph(fallbackGraph, fallbackState);
  appendRouteTraceEvent(trace, "select", {
    route: config.targetPath,
    mode,
    reason: decision.reason,
  });
  fallbackState = recordFallbackVisit(fallbackState, decision.next);

  const forwarded = new Request(url, request);
  const startedAt = Date.now();
  const response = await fetch(forwarded);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    appendRouteTraceEvent(trace, "final", { status: response.status, contentType, route: config.targetPath });
    const binaryEnvelope = {
      mode,
      provider: null,
      model: requestBody?.model || null,
      correlation_id: correlationId,
      output_type: contentType || "application/octet-stream",
      output_kind: mode === "audio" ? "binary-audio" : "binary",
    };
    await saveRequestDetail({
      provider: null,
      model: requestBody?.model || null,
      endpoint: UNIFIED_MODALITY_ENDPOINT,
      status: response.ok ? "success" : "error",
      request: { mode, correlation_id: correlationId, body: { mode, model: requestBody?.model || null } },
      response: { status: response.status, contentType, correlation_id: correlationId, envelope: binaryEnvelope },
      providerResponse: { trace },
      latency: { ttft: 0, total: Date.now() - startedAt },
      tokens: {},
      timestamp: new Date().toISOString(),
    });
    const passthroughHeaders = new Headers(response.headers);
    passthroughHeaders.set("x-correlation-id", correlationId);
    passthroughHeaders.set("x-axonrouter-mode", mode);
    passthroughHeaders.set("x-axonrouter-output-kind", binaryEnvelope.output_kind);
    return new Response(response.body, {
      status: response.status,
      headers: passthroughHeaders,
    });
  }

  const payload = await response.json().catch(() => null);
  const headers = new Headers(response.headers);
  headers.set("x-correlation-id", correlationId);
  headers.set("x-axonrouter-mode", mode);

  if (!payload || typeof payload !== "object") {
    return new Response(JSON.stringify({
      mode,
      correlation_id: correlationId,
      output: null,
    }), { status: response.status, headers });
  }

  const inferredProvider = typeof payload?.provider === "string"
    ? payload.provider
    : typeof payload?.model === "string" && payload.model.includes("/")
      ? payload.model.split("/")[0]
      : null;

  const normalized = {
    mode,
    provider: inferredProvider,
    model: payload?.model || requestBody?.model || null,
    usage: payload?.usage || null,
    correlation_id: correlationId,
    output: payload,
    data: payload?.data,
  };

  appendRouteTraceEvent(trace, response.ok ? "final" : "fallback", {
    status: response.status,
    provider: inferredProvider,
    model: normalized.model,
    route: config.targetPath,
  });

  await saveRequestDetail({
    provider: inferredProvider,
    model: normalized.model,
    endpoint: UNIFIED_MODALITY_ENDPOINT,
    status: response.ok ? "success" : "error",
    request: {
      mode,
      correlation_id: correlationId,
      body: { mode, model: requestBody?.model || null },
    },
    response: {
      status: response.status,
      correlation_id: correlationId,
      usage: normalized.usage,
    },
    providerResponse: { trace },
    latency: { ttft: 0, total: Date.now() - startedAt },
    tokens: {
      input_tokens: Number(normalized?.usage?.prompt_tokens || normalized?.usage?.input_tokens || 0),
      output_tokens: Number(normalized?.usage?.completion_tokens || normalized?.usage?.output_tokens || 0),
    },
    timestamp: new Date().toISOString(),
  });

  return new Response(JSON.stringify(normalized), {
    status: response.status,
    headers,
  });
}

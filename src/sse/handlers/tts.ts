import {
  extractApiKey, isValidApiKey, hasApiKeys,
  getProviderCredentials, markAccountUnavailable,
} from "../services/auth";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { checkRateLimit, getRateLimitHeaders, OPEN_MODE_LIMIT_PER_MIN, DEFAULT_KEY_LIMIT_PER_MIN } from "@/lib/rateLimiter";
import { getModelInfo } from "../services/model";
import { handleTtsCore } from "../../../open-sse/handlers/ttsCore";
import { errorResponse, unavailableResponse } from "../../../open-sse/utils/error";
import { HTTP_STATUS } from "../../../open-sse/config/runtimeConfig";
import * as log from "../utils/logger";
import { appendRouteTraceEvent, createRouteTrace } from "@/lib/tracing/routeDecisionTrace";
import { createFallbackGraph, evaluateFallbackGraph, recordFallbackVisit } from "@/lib/routing/fallbackGraph";

// Providers that require stored credentials (not noAuth)
const CREDENTIALED_PROVIDERS = new Set(["openai", "elevenlabs", "openrouter", "gemini"]);

export async function handleTts(request) {
  // Enforce request body size limit
  const contentLength = Number(request.headers.get('content-length') || 0);
  const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
  if (contentLength > MAX_BODY_SIZE) {
    return errorResponse(413, "Request body too large");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const url = new URL(request.url);
  const modelStr = body.model;
  const responseFormat = url.searchParams.get("response_format") || "mp3"; // mp3 (default) | json
  log.request("POST", `${url.pathname} | ${modelStr} | format=${responseFormat}`);

  const settings = await getCurrentSettings();
  const apiKey = extractApiKey(request);
  const keysConfigured = await hasApiKeys();
  if (keysConfigured) {
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  // Rate limiting
  const rateLimitId = apiKey || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown-ip';
  const rateLimitMax = apiKey ? (settings?.rateLimitPerKey || DEFAULT_KEY_LIMIT_PER_MIN) : OPEN_MODE_LIMIT_PER_MIN;
  const rateResult = checkRateLimit(rateLimitId, rateLimitMax);
  if (!rateResult.allowed) {
    return new Response(JSON.stringify({ error: { message: "Rate limit exceeded", type: "rate_limit_error" } }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...getRateLimitHeaders(rateResult, rateLimitMax) },
    });
  }

  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  if (!body.input) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: input");

  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");

  const { provider, model } = modelInfo;
  log.info("ROUTING", `Provider: ${provider}, Voice: ${model}`);
  const trace = createRouteTrace({
    correlationId: request?.headers?.get("x-correlation-id") || null,
    mode: "audio",
    requestedModel: modelStr,
  });
  const fallbackGraph = createFallbackGraph({
    primary: { id: `${provider}:${model}:primary`, provider, model },
    fallbacks: [],
    budgets: { maxHops: 10, retryBudget: 9 },
  });
  let fallbackState = { visited: [], hops: 0, retryCount: 0 };

  // noAuth providers — no credential needed
  if (!CREDENTIALED_PROVIDERS.has(provider)) {
    const result = await handleTtsCore({ provider, model, input: body.input, credentials: null, responseFormat });
    if (result.success) {
      appendRouteTraceEvent(trace, "final", { provider, model, status: "success", route: "noauth" });
      return result.response;
    }
    return errorResponse(result.status || HTTP_STATUS.BAD_GATEWAY, result.error || "TTS failed");
  }

  // Credentialed providers — fallback loop (same pattern as embeddings)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const fallbackDecision = evaluateFallbackGraph(fallbackGraph, fallbackState);
    appendRouteTraceEvent(trace, "select", {
      provider,
      model,
      reason: fallbackDecision.reason,
      endpoint: url.pathname,
    });
    fallbackState = recordFallbackVisit(fallbackState, fallbackDecision.next);
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model, null, apiKey ? { requestApiKey: apiKey } : null);

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const msg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        appendRouteTraceEvent(trace, "final", { provider, model, status, reason: msg });
        return unavailableResponse(status, `[${provider}/${model}] ${msg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      appendRouteTraceEvent(trace, "final", { provider, model, status: lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, reason: lastError || "all_accounts_unavailable" });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const result = await handleTtsCore({ provider, model, input: body.input, credentials, responseFormat });

    if (result.success) {
      appendRouteTraceEvent(trace, "final", { provider, model, status: "success" });
      return result.response;
    }

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model, result.resetsAtMs);
    if (shouldFallback) {
      appendRouteTraceEvent(trace, "fallback", { provider, model, status: result.status, reason: result.error || "fallback_required" });
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }
    appendRouteTraceEvent(trace, "final", { provider, model, status: result.status || "error" });
    return result.response || errorResponse(result.status, result.error);
  }
}

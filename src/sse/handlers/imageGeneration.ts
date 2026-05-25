import { getCurrentSettings } from "@/lib/settingsAccess";
import { checkRateLimit, getRateLimitHeaders, OPEN_MODE_LIMIT_PER_MIN, DEFAULT_KEY_LIMIT_PER_MIN } from "@/lib/rateLimiter";
import { handleImageGenerationCore } from "../../../open-sse/handlers/imageGenerationCore";
import { errorResponse, unavailableResponse } from "../../../open-sse/utils/error";
import { HTTP_STATUS } from "../../../open-sse/config/runtimeConfig";
import * as log from "../utils/logger";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh";
import { appendRouteTraceEvent, createRouteTrace } from "@/lib/tracing/routeDecisionTrace";
import { createFallbackGraph, evaluateFallbackGraph, recordFallbackVisit } from "@/lib/routing/fallbackGraph";

// Providers that don't require credentials (noAuth)
const NO_AUTH_PROVIDERS = new Set(["sdwebui", "comfyui"]);

/**
 * Handle image generation request
 * @param {Request} request
 */
export async function handleImageGeneration(request) {
  const auth = await import("../services/auth");
  const modelService = await import("../services/model");

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
    log.warn("IMAGE", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const url = new URL(request.url);
  const modelStr = body.model;

  log.request("POST", `${url.pathname} | ${modelStr}`);

  const apiKey = auth.extractApiKey(request);
  if (apiKey) {
    log.debug("AUTH", `API Key: ${log.maskKey(apiKey)}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  const settings = await getCurrentSettings();
  const keysConfigured = await auth.hasApiKeys();
  if (keysConfigured) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await auth.isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
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

  if (!modelStr) {
    log.warn("IMAGE", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  if (!body.prompt) {
    log.warn("IMAGE", "Missing prompt");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: prompt");
  }

  const modelInfo = await modelService.getModelInfo(modelStr);
  if (!modelInfo.provider) {
    log.warn("IMAGE", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo;

  if (modelStr !== `${provider}/${model}`) {
    log.info("ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  const trace = createRouteTrace({
    correlationId: request?.headers?.get("x-correlation-id") || null,
    mode: "image",
    requestedModel: modelStr,
  });
  const fallbackGraph = createFallbackGraph({
    primary: { id: `${provider}:${model}:primary`, provider, model },
    fallbacks: [],
    budgets: { maxHops: 10, retryBudget: 9 },
  });
  let fallbackState = { visited: [], hops: 0, retryCount: 0 };

  // noAuth providers — no credential needed
  if (NO_AUTH_PROVIDERS.has(provider)) {
    const result = await handleImageGenerationCore({
      body,
      modelInfo: { provider, model },
      credentials: null,
      log,
      onCredentialsRefreshed: async () => {},
      onRequestSuccess: async () => {},
    });
    if (result.success) {
      appendRouteTraceEvent(trace, "final", { provider, model, status: "success", route: "noauth" });
      return result.response;
    }

    const status = "status" in result ? result.status : HTTP_STATUS.BAD_GATEWAY;
    const message = "error" in result ? result.error : "Image generation failed";
    return errorResponse(status || HTTP_STATUS.BAD_GATEWAY, message || "Image generation failed");
  }

  // Credentialed providers — fallback loop
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
    const credentials = await auth.getProviderCredentials(provider, excludeConnectionIds, model, null, apiKey ? { requestApiKey: apiKey } : null);

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        appendRouteTraceEvent(trace, "final", { provider, model, status, reason: errorMsg });
        log.warn("IMAGE", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.error("AUTH", `No credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      }
      appendRouteTraceEvent(trace, "final", { provider, model, status: lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, reason: lastError || "all_accounts_unavailable" });
      log.warn("IMAGE", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    const result = await handleImageGenerationCore({
      body,
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      onCredentialsRefreshed: async (newCreds) => {
        await updateProviderCredentials(credentials.connectionId, {
          accessToken: newCreds.accessToken,
          refreshToken: newCreds.refreshToken,
          providerSpecificData: newCreds.providerSpecificData,
        });
      },
      onRequestSuccess: async (responseHeaders?: any) => {
        await auth.clearAccountError(credentials.connectionId, credentials, model, responseHeaders);
      }
    });

    if (result.success) {
      appendRouteTraceEvent(trace, "final", { provider, model, status: "success" });
      return result.response;
    }

    const status = "status" in result ? result.status : HTTP_STATUS.BAD_GATEWAY;
    const error = "error" in result ? result.error : "Request failed";
    const resetsAtMs = "resetsAtMs" in result ? result.resetsAtMs : null;

    const { shouldFallback } = await auth.markAccountUnavailable(credentials.connectionId, status, error, provider, model, resetsAtMs);

    if (shouldFallback) {
      appendRouteTraceEvent(trace, "fallback", { provider, model, status, reason: error || "fallback_required" });
      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${status}), trying fallback`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = error;
      lastStatus = status;
      continue;
    }

    appendRouteTraceEvent(trace, "final", { provider, model, status: status || "error" });
    return result.response;
  }
}

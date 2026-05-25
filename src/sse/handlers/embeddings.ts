import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
} from "../services/embeddingsAuth";
import { extractApiKey, isValidApiKey, hasApiKeys } from "../services/apiKeyAuth";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { checkRateLimit, getRateLimitHeaders, OPEN_MODE_LIMIT_PER_MIN, DEFAULT_KEY_LIMIT_PER_MIN } from "@/lib/rateLimiter";
import { getModelInfo } from "../services/model";
import { handleEmbeddingsCore } from "../../../open-sse/handlers/embeddingsCore";
import { errorResponse, unavailableResponse } from "../../../open-sse/utils/error";
import { HTTP_STATUS } from "../../../open-sse/config/runtimeConfig";
import * as log from "../utils/logger";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh";
import { appendRouteTraceEvent, createRouteTrace } from "@/lib/tracing/routeDecisionTrace";
import { createFallbackGraph, evaluateFallbackGraph, recordFallbackVisit } from "@/lib/routing/fallbackGraph";

/**
 * Handle embeddings request for the SSE/Next.js server.
 * Follows the same auth + fallback pattern as handleChat.
 *
 * @param {Request} request
 */
export async function handleEmbeddings(request) {
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
    log.warn("EMBEDDINGS", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const url = new URL(request.url);
  const modelStr = body.model;

  log.request("POST", `${url.pathname} | ${modelStr}`);

  // Log API key (masked)
  const apiKey = extractApiKey(request);
  if (apiKey) {
    log.debug("AUTH", `API Key: ${log.maskKey(apiKey)}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Auto-require API key when keys are configured
  const settings = await getCurrentSettings();
  const keysConfigured = await hasApiKeys();
  if (keysConfigured) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
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
    log.warn("EMBEDDINGS", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  if (!body.input) {
    log.warn("EMBEDDINGS", "Missing input");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: input");
  }

  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) {
    log.warn("EMBEDDINGS", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo;

  if (modelStr !== `${provider}/${model}`) {
    log.info("ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  // Credential + fallback loop (mirrors handleChat)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;
  const trace = createRouteTrace({
    correlationId: request?.headers?.get("x-correlation-id") || null,
    mode: "embedding",
    requestedModel: modelStr,
  });
  const fallbackGraph = createFallbackGraph({
    primary: { id: `${provider}:${model}:primary`, provider, model },
    fallbacks: [],
    budgets: { maxHops: 10, retryBudget: 9 },
  });
  let fallbackState = { visited: [], hops: 0, retryCount: 0 };

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

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        appendRouteTraceEvent(trace, "final", { provider, model, status, reason: errorMsg });
        log.warn("EMBEDDINGS", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.error("AUTH", `No credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      }
      appendRouteTraceEvent(trace, "final", { provider, model, status: lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, reason: lastError || "all_accounts_unavailable" });
      log.warn("EMBEDDINGS", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    const result = await handleEmbeddingsCore({
      body: { ...body, model: `${provider}/${model}` },
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
        await clearAccountError(credentials.connectionId, credentials, model, responseHeaders);
      }
    });

    if (result.success) {
      appendRouteTraceEvent(trace, "final", { provider, model, status: "success" });
      return result.response;
    }

    const failureStatus = "status" in result ? result.status : HTTP_STATUS.SERVICE_UNAVAILABLE;
    const failureError = "error" in result ? result.error : "Request failed";
    const failureResetsAtMs = "resetsAtMs" in result ? result.resetsAtMs : null;

    const { shouldFallback } = await markAccountUnavailable(
      credentials.connectionId,
      failureStatus,
      failureError,
      provider,
      model,
      failureResetsAtMs,
    );

    if (shouldFallback) {
      appendRouteTraceEvent(trace, "fallback", { provider, model, status: failureStatus, reason: failureError || "fallback_required" });
      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${failureStatus}), trying fallback`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = failureError;
      lastStatus = failureStatus;
      continue;
    }

    appendRouteTraceEvent(trace, "final", { provider, model, status: failureStatus || "error" });
    return result.response;
  }
}

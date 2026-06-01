import "../../../open-sse/utils/proxyFetch";

import { isVirtualSystemModel, resolveVirtualModelExecution } from "@/lib/routing/virtualModelResolver";
import { extractApiKey, isValidApiKey, hasApiKeys } from "../services/apiKeyAuth";
import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
} from "../services/embeddingsAuth";
import { PROVIDER_MODELS } from "@/shared/constants/models";
import { cacheClaudeHeaders } from "../../../open-sse/utils/claudeHeaderCache";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { getCurrentCombos } from "@/lib/modelCatalogAccess";
import { getModelInfo, getComboModels, getComboForModel } from "../services/model";
import { errorResponse, unavailableResponse } from "../../../open-sse/utils/error";
import { handleComboChat } from "../../../open-sse/services/combo";
import { handleBypassRequest } from "../../../open-sse/utils/bypassHandler";
import { HTTP_STATUS } from "../../../open-sse/config/runtimeConfig";
import { detectFormatByEndpoint } from "../../../open-sse/translator/formats";
import * as log from "../utils/logger";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh";
import { getProjectIdForConnection } from "../../../open-sse/services/projectId";
import { attachChatSlotRelease, tryAcquireChatSlot } from "@/lib/chat/concurrencyLimiter";
import { checkRateLimit, getRateLimitHeaders, OPEN_MODE_LIMIT_PER_MIN, DEFAULT_KEY_LIMIT_PER_MIN } from "@/lib/rateLimiter";
import { setChatRuntimeSettings } from "../../../open-sse/utils/abort";
import { appendRouteTraceEvent, createRouteTrace } from "@/lib/tracing/routeDecisionTrace";
import { createFallbackGraph, evaluateFallbackGraph, recordFallbackVisit } from "@/lib/routing/fallbackGraph";
import { recordAutoRoutingSignal } from "@/lib/routing/autoRoutingTelemetry";

const codexModelIds = new Set((PROVIDER_MODELS.cx || []).map((entry) => entry?.id).filter(Boolean));

let handleChatCorePromise: Promise<typeof import("../../../open-sse/handlers/chatCore")["handleChatCore"]> | null = null;

async function getHandleChatCore() {
  if (!handleChatCorePromise) {
    handleChatCorePromise = import("../../../open-sse/handlers/chatCore").then((mod) => mod.handleChatCore);
  }
  return handleChatCorePromise;
}

async function getComboListForExecution() {
  try {
    return await getCurrentCombos();
  } catch {
    return [];
  }
}

/**
 * Handle chat completion request
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats
 * Format detection and translation handled by translator
 */
export async function handleChat(request, clientRawRequest = null) {
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
    log.warn("CHAT", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  // Build clientRawRequest for logging (if not provided)
  if (!clientRawRequest) {
    const url = new URL(request.url);
    const rawHeaders = Object.fromEntries(request.headers.entries());
    delete rawHeaders.authorization;
    delete rawHeaders.Authorization;
    clientRawRequest = {
      endpoint: url.pathname,
      body,
      headers: rawHeaders
    };
  }
  cacheClaudeHeaders(clientRawRequest.headers);

  // Log request endpoint and model
  const url = new URL(request.url);
  const modelStr = body.model;

  // Count messages (support both messages[] and input[] formats)
  const msgCount = body.messages?.length || body.input?.length || 0;
  const toolCount = body.tools?.length || 0;
  const effort = body.reasoning_effort || body.reasoning?.effort || null;
  log.request("POST", `${url.pathname} | ${modelStr} | ${msgCount} msgs${toolCount ? ` | ${toolCount} tools` : ""}${effort ? ` | effort=${effort}` : ""}`);

  // Log API key (masked)
  const authHeader = request.headers.get("Authorization");
  const apiKey = extractApiKey(request);
  if (authHeader && apiKey) {
    const masked = log.maskKey(apiKey);
    log.debug("AUTH", `API Key: ${masked}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Enforce API key if enabled in settings
  const settings = await getCurrentSettings();
  setChatRuntimeSettings(settings.chatRuntime);
  const requestContext = {
    settings,
    comboModelsByName: new Map(),
    virtualResolution: null as any,
  };
  // Auto-require API key when keys are configured in the system
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
    log.warn("CHAT", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }


  // Bypass naming/warmup requests before combo rotation to avoid wasting rotation slots
  const userAgent = request?.headers?.get("user-agent") || "";
  const bypassResponse = await handleBypassRequest(body, modelStr, userAgent, !!settings.ccFilterNaming);
  if (bypassResponse) return bypassResponse.response || bypassResponse;

  let effectiveModelStr = modelStr;

  if (isVirtualSystemModel(effectiveModelStr)) {
    const resolution = await resolveVirtualModelExecution({ modelStr: effectiveModelStr, settings });
    if (resolution) {
      requestContext.virtualResolution = resolution;
      effectiveModelStr = resolution.selectedCombo;
    }
  }

  const comboObject = await getComboModels(effectiveModelStr);
  requestContext.comboModelsByName.set(effectiveModelStr, comboObject);
  if (comboObject) {
    const routing = settings.routing || {};
    const comboStrategies = routing.comboStrategies || settings.comboStrategies || {};
    const comboConfig = comboStrategies[effectiveModelStr] || {};
    const comboSpecificStrategy = comboConfig.strategy;
    const comboStrategy = comboSpecificStrategy || routing.comboStrategy || comboObject.strategy || "priority";
    const comboStickyLimit = comboConfig.stickyLimit || comboObject?.config?.stickyLimit || routing.stickyLimit || 1;

    log.info("CHAT", `Combo \"${effectiveModelStr}\" with ${(comboObject.models || []).length} steps (strategy: ${comboStrategy}, stickyLimit: ${comboStickyLimit})`);
    return handleComboChat({
      body,
      combo: { ...comboObject, strategy: comboStrategy },
      models: comboObject.models,
      handleSingleModel: (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, requestContext),
      log,
      comboName: effectiveModelStr,
      comboStrategy,
      comboStickyLimit,
      resolveCombo: async (name) => getComboForModel(name),
      settings,
      allCombos: await getComboListForExecution(),
      isModelAvailable: async (candidateModel, target = null) => {
        if (!candidateModel || !candidateModel.includes('/')) return false;
        const candidateInfo = await getModelInfo(candidateModel);
        if (!candidateInfo?.provider) return true;
        const forcedConnectionId = typeof target?.connectionId === "string" && target.connectionId.trim().length > 0 ? target.connectionId : null;
        const creds = await getProviderCredentials(
          candidateInfo.provider,
          new Set(),
          candidateInfo.model || candidateModel,
          forcedConnectionId ? { forcedConnectionId } : null,
          apiKey ? { requestApiKey: apiKey } : null,
        );
        return Boolean(creds && !creds.allRateLimited);
      },
    });
  }

  return handleSingleModelChat(body, effectiveModelStr, clientRawRequest, request, apiKey, requestContext);
}

/**
 * Handle single model chat request
 */
function isBareImplicitOpenAIModel(modelStr, provider, model) {
  if (typeof modelStr !== "string" || modelStr.includes("/")) return false;
  if (provider !== "openai" || typeof model !== "string") return false;
  return /^(gpt-|o1|o3|o4)/i.test(model);
}

function codexHasMatchingModel(model) {
  return codexModelIds.has(model);
}

async function handleSingleModelChat(body, modelStr, clientRawRequest = null, request = null, apiKey = null, requestContext = null) {
  const modelInfo = await getModelInfo(modelStr);
  const settings = requestContext?.settings ?? await getCurrentSettings();

  // If provider is null, this might be a combo name - check and handle
  if (!modelInfo.provider) {
    let comboObject = requestContext?.comboModelsByName?.get(modelStr);
    if (comboObject === undefined) {
      comboObject = await getComboModels(modelStr);
      requestContext?.comboModelsByName?.set(modelStr, comboObject);
    }
    if (comboObject) {
      const routing = settings.routing || {};
      const comboStrategies = routing.comboStrategies || settings.comboStrategies || {};
      const comboConfig = comboStrategies[modelStr] || {};
      const comboSpecificStrategy = comboConfig.strategy;
      const comboStrategy = comboSpecificStrategy || routing.comboStrategy || comboObject.strategy || "priority";
      const comboStickyLimit = comboConfig.stickyLimit || comboObject?.config?.stickyLimit || routing.stickyLimit || 1;

      log.info("CHAT", `Combo \"${modelStr}\" with ${(comboObject.models || []).length} steps (strategy: ${comboStrategy}, stickyLimit: ${comboStickyLimit})`);
      return handleComboChat({
        body,
        combo: { ...comboObject, strategy: comboStrategy },
        models: comboObject.models,
        handleSingleModel: (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, requestContext),
        log,
        comboName: modelStr,
        comboStrategy,
        comboStickyLimit,
        resolveCombo: async (name) => getComboForModel(name),
        allCombos: await getComboListForExecution(),
        settings,
        isModelAvailable: async (candidateModel, target = null) => {
          if (!candidateModel || !candidateModel.includes('/')) return false;
          const candidateInfo = await getModelInfo(candidateModel);
          if (!candidateInfo?.provider) return true;
          const forcedConnectionId = typeof target?.connectionId === "string" && target.connectionId.trim().length > 0 ? target.connectionId : null;
          const creds = await getProviderCredentials(
            candidateInfo.provider,
            new Set(),
            candidateInfo.model || candidateModel,
            forcedConnectionId ? { forcedConnectionId } : null,
            apiKey ? { requestApiKey: apiKey } : null,
          );
          return Boolean(creds && !creds.allRateLimited);
        },
      });
    }
    log.warn("CHAT", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  let { provider, model } = modelInfo;

  // Log model routing (alias → actual model)
  if (modelStr !== `${provider}/${model}`) {
    log.info("ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  // Extract userAgent from request
  const userAgent = request?.headers?.get("user-agent") || "";
  const allowCodexFallback = isBareImplicitOpenAIModel(modelStr, provider, model);
  const preferCodexFirst = allowCodexFallback && codexHasMatchingModel(model);

  // Try with available accounts (fallback on errors)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;
  const MAX_FALLBACK_ATTEMPTS = 2;
  let fallbackAttempts = 0;
  let attemptedCodexFallback = false;
  const trace = createRouteTrace({
    correlationId: request?.headers?.get("x-correlation-id") || null,
    mode: "text",
    requestedModel: modelStr,
  });
  if (requestContext?.virtualResolution) {
    appendRouteTraceEvent(trace, "virtual_resolution", requestContext.virtualResolution);
  }
  const fallbackGraph = createFallbackGraph({
    primary: { id: `${provider}:${model}:primary`, provider, model },
    fallbacks: allowCodexFallback && preferCodexFirst ? [{ id: `openai:${model}:fallback`, provider: "openai", model }] : [],
    budgets: { maxHops: MAX_FALLBACK_ATTEMPTS, retryBudget: MAX_FALLBACK_ATTEMPTS - 1 },
  });
  let fallbackState = { visited: [], hops: 0, retryCount: 0 };

  if (preferCodexFirst && provider === "openai") {
    provider = "codex";
    log.info("ROUTING", `Bare model ${model} exists in Codex; preferring codex/${model} before openai/${model}`);
  }

  const routingOverride = requestContext?.executionPolicy
    ? {
        strategy: requestContext.executionPolicy.providerStrategy,
        stickyLimit: requestContext.executionPolicy.stickyLimit,
      }
    : null;

  while (fallbackAttempts < MAX_FALLBACK_ATTEMPTS) {
    fallbackAttempts += 1;
    const fallbackDecision = evaluateFallbackGraph(fallbackGraph, fallbackState);
    appendRouteTraceEvent(trace, "select", {
      provider,
      model,
      reason: fallbackDecision.reason,
      attempt: fallbackAttempts,
    });
    fallbackState = recordFallbackVisit(fallbackState, fallbackDecision.next);
    let credentials = await getProviderCredentials(provider, excludeConnectionIds, model, routingOverride, apiKey ? { requestApiKey: apiKey } : null);

    if (!credentials && allowCodexFallback && provider === "codex" && preferCodexFirst && !attemptedCodexFallback) {
      attemptedCodexFallback = true;
      provider = "openai";
      excludeConnectionIds.clear();
      if (requestContext?.virtualResolution) {
        recordAutoRoutingSignal({
          virtualModel: requestContext.virtualResolution.requestedModel,
          combo: requestContext.virtualResolution.selectedCombo,
          provider,
          status: "fallback",
          fallback: true,
        });
      }
      appendRouteTraceEvent(trace, "fallback", { provider, model, reason: "codex_missing_credentials" });
      log.info("ROUTING", `No active Codex credentials for bare model ${model}; retrying with openai/${model}`);
      credentials = await getProviderCredentials(provider, excludeConnectionIds, model, routingOverride, apiKey ? { requestApiKey: apiKey } : null);
    }

    if (credentials?.allRateLimited && allowCodexFallback && provider === "codex" && preferCodexFirst && !attemptedCodexFallback) {
      attemptedCodexFallback = true;
      provider = "openai";
      excludeConnectionIds.clear();
      lastError = credentials.lastError || lastError;
      lastStatus = Number(credentials.lastErrorCode) || lastStatus;
      if (requestContext?.virtualResolution) {
        recordAutoRoutingSignal({
          virtualModel: requestContext.virtualResolution.requestedModel,
          combo: requestContext.virtualResolution.selectedCombo,
          provider,
          status: "fallback",
          fallback: true,
        });
      }
      appendRouteTraceEvent(trace, "fallback", { provider, model, reason: "codex_rate_limited" });
      log.info("ROUTING", `Codex unavailable for bare model ${model}; retrying with openai/${model}`);
      credentials = await getProviderCredentials(provider, excludeConnectionIds, model, routingOverride, apiKey ? { requestApiKey: apiKey } : null);
    }

    if (modelStr !== `${provider}/${model}`) {
      log.info("ROUTING", `${modelStr} → ${provider}/${model}`);
    }

    // Command Code needs the normalized upstream slug, while native full slugs like
    // moonshotai/Kimi-K2.6 must still pass through unchanged.
    const routedModel = provider === "commandcode"
      ? model
      : ((modelInfo as any)?.isCommandCode ? modelStr : `${provider}/${model}`);
    body = { ...body, model: routedModel };

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (requestContext?.virtualResolution) {
        recordAutoRoutingSignal({
          virtualModel: requestContext.virtualResolution.requestedModel,
          combo: requestContext.virtualResolution.selectedCombo,
          provider,
          status: lastStatus || credentials?.lastErrorCode || "error",
          fallback: fallbackAttempts > 1,
        });
      }
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.warn("AUTH", `No active credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.NOT_FOUND, `No active credentials for provider: ${provider}`);
      }
      log.warn("CHAT", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    // Log account selection
    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    // Token refresh returned unrecoverable error — skip this connection
    if (refreshedCredentials._authBlocked) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = "Token refresh failed: re-authentication required";
      lastStatus = 401;
      continue;
    }

    // Ensure real project ID is available for providers that need it (P0 fix: cold miss)
    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
      const pid = await getProjectIdForConnection(credentials.connectionId, refreshedCredentials.accessToken);
      if (pid) {
        refreshedCredentials.projectId = pid;
        // Persist to DB in background so subsequent requests have it immediately
        updateProviderCredentials(credentials.connectionId, { projectId: pid }).catch(() => { });
      }
    }

    // Use shared chatCore
    const providerThinking = (settings.providerThinking || {})[provider] || null;
    const slot = tryAcquireChatSlot({
      provider,
      connectionId: credentials.connectionId,
      limits: settings.chatRuntime,
    });
    if (!slot.ok) {
      if (slot.status === HTTP_STATUS.RATE_LIMITED) {
        log.warn("AUTH", `Account ${credentials.connectionName} at concurrency limit, trying fallback`);
        excludeConnectionIds.add(credentials.connectionId);
        lastError = slot.reason || "Account concurrency limit reached";
        lastStatus = slot.status;
        continue;
      }
      return errorResponse(slot.status || HTTP_STATUS.SERVICE_UNAVAILABLE, slot.reason || "Chat service is overloaded");
    }

    let result;
    try {
      const handleChatCore = await getHandleChatCore();
      result = await handleChatCore({
        body: { ...body, model: `${provider}/${model}` },
        modelInfo: { provider, model },
        credentials: refreshedCredentials,
        log,
        clientRawRequest,
        connectionId: credentials.connectionId,
        userAgent,
        apiKey,
        ccFilterNaming: !!settings.ccFilterNaming,
        providerThinking,
        cavemanSettings: settings.caveman,
        // Detect source format by endpoint + body
        sourceFormatOverride: request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) : null,
        onCredentialsRefreshed: async (newCreds) => {
          await updateProviderCredentials(credentials.connectionId, {
            accessToken: newCreds.accessToken,
            refreshToken: newCreds.refreshToken,
            providerSpecificData: newCreds.providerSpecificData,
          });
        },
        onRequestSuccess: async (responseHeaders?: any) => {
          await clearAccountError(credentials.connectionId, credentials, model, responseHeaders);
        },
        onDisconnect: null,
      });

      if (result.success) {
        if (requestContext?.virtualResolution) {
          recordAutoRoutingSignal({
            virtualModel: requestContext.virtualResolution.requestedModel,
            combo: requestContext.virtualResolution.selectedCombo,
            provider,
            status: "success",
            fallback: fallbackAttempts > 1,
          });
        }
        appendRouteTraceEvent(trace, "final", { provider, model, attempt: fallbackAttempts, status: "success" });
        return attachChatSlotRelease(result.response, slot.release);
      }
    } catch (error) {
      slot.release();
      throw error;
    }

    slot.release();

    // Mark account unavailable (auto-calculates cooldown with exponential backoff, or precise resetsAtMs)
    // Preserve canonical timeout codes so direct-fetch hangs enter transient cooldown and fallback rotation.
    const fallbackErrorText =
      result?.errorCode && !String(result.error || "").includes(String(result.errorCode))
        ? `${result.error} [code=${result.errorCode}]`
        : result.error;
    const { shouldFallback } = await markAccountUnavailable(
      credentials.connectionId,
      result.status,
      fallbackErrorText,
      provider,
      model,
      result.resetsAtMs,
    );

    if (shouldFallback) {
      if (requestContext?.virtualResolution) {
        recordAutoRoutingSignal({
          virtualModel: requestContext.virtualResolution.requestedModel,
          combo: requestContext.virtualResolution.selectedCombo,
          provider,
          status: result.status || "fallback",
          fallback: true,
        });
      }
      appendRouteTraceEvent(trace, "fallback", { provider, model, attempt: fallbackAttempts, status: result.status, reason: result.error || "fallback_required" });
      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${result.status}), trying fallback`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = `Account ${credentials.connectionName}: ${result.error}`;
      lastStatus = result.status;
      continue;
    }

    if (requestContext?.virtualResolution) {
      recordAutoRoutingSignal({
        virtualModel: requestContext.virtualResolution.requestedModel,
        combo: requestContext.virtualResolution.selectedCombo,
        provider,
        status: result.status || "error",
        fallback: fallbackAttempts > 1,
      });
    }
    appendRouteTraceEvent(trace, "final", { provider, model, attempt: fallbackAttempts, status: result.status || "error" });
    return result.response;
  }

  // Guarantee termination even if selection/fallback state oscillates unexpectedly.
  log.error("CHAT", "Max fallback attempts reached", {
    provider,
    model,
    attempts: fallbackAttempts,
    maxAttempts: MAX_FALLBACK_ATTEMPTS,
  });

  return errorResponse(
    HTTP_STATUS.RATE_LIMITED,
    lastError || `${provider}/${model} temporarily unavailable after ${MAX_FALLBACK_ATTEMPTS} account attempts; please retry`
  );
}

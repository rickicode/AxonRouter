import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { getModelInfo } from "../services/model.js";
import { handleEmbeddingsCore } from "open-sse/handlers/embeddingsCore.js";
import { resolveCapabilityProxy } from "../services/capabilityProxy.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { MAX_FALLBACK_ATTEMPTS } from "open-sse/config/errorConfig.js";
import * as log from "../utils/logger.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { saveRequestUsage } from "@/lib/usageDb.js";
import { saveCapabilityUsage } from "../services/capabilityUsage.js";

function resolveEmbeddingUsage(raw, input) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const promptTokens = raw.prompt_tokens ?? raw.input_tokens;
    const completionTokens = raw.completion_tokens ?? raw.output_tokens ?? 0;
    const totalTokens = raw.total_tokens ?? promptTokens;
    if (Number.isSafeInteger(promptTokens) && promptTokens > 0) {
      return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        ...(raw.estimated ? { estimated: true } : {}),
      };
    }
  }
  return estimateEmbeddingTokens(input);
}

// Some providers (e.g. Cloudflare Workers AI embeddings) return no usage object at all.
// Estimate from input length so usage_history still records the call (~4 chars/token).
function estimateEmbeddingTokens(input) {
  const parts = Array.isArray(input) ? input : [input];
  const chars = parts.reduce((n, t) => {
    if (typeof t === "string") return n + t.length;
    if (Array.isArray(t)) return n + t.length;
    return n + JSON.stringify(t ?? "").length;
  }, 0);
  const promptTokens = Math.max(1, Math.ceil(chars / 4));
  return { prompt_tokens: promptTokens, completion_tokens: 0, total_tokens: promptTokens, estimated: true };
}

/**
 * Handle embeddings request for the gateway (src/sse) server.
 * Follows the same auth + fallback pattern as handleChat.
 *
 * @param {Request} request
 */
export async function handleEmbeddings(request) {
  // Model probes must not pollute production usage or routing state.
  const isTestRequest = request.headers.get("x-axonrouter-test-request") === "1";
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

  // Enforce API key if enabled in settings
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
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

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("EMBEDDINGS", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman, {
          code: credentials.lastErrorCode,
          provider,
          model,
          statusBreakdown: credentials.statusBreakdown,
        });
      }
      if (excludeConnectionIds.size === 0) {
        log.error("AUTH", `No credentials for provider: ${provider}`);
      return unavailableResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, `No credentials for provider: ${provider}`, null, null, {
        code: "NO_CREDENTIALS",
        provider,
        model,
      });
      }
      log.warn("EMBEDDINGS", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    // Proxied egress for the embedding call. The chat path resolves this inside
    // chatCore; capability cores receive it from here. Null keeps direct egress.
    const proxyOptions = await resolveCapabilityProxy({ provider, model, credentials: refreshedCredentials });

    // Timed per attempt (not per request) so a credential fallback does not
    // attribute the first account's latency to the second account's row.
    const attemptStart = Date.now();

    const result = await handleEmbeddingsCore({
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      proxyOptions,
      log,
      onCredentialsRefreshed: async (newCreds) => {
        await updateProviderCredentials(credentials.connectionId, {
          ...newCreds,
          existingProviderSpecificData: credentials.providerSpecificData,
          testStatus: "active"
        });
      },
      onRequestSuccess: async () => {
        // Probes must not rewire production routing state.
        if (!isTestRequest) await clearAccountError(credentials.connectionId, credentials, model);
      }
    });

    const latencyMs = Date.now() - attemptStart;
    // Counts and lengths only — the input text and the returned vectors are not
    // persisted (see handleEmbeddingsCore's summary contract).
    const requestSummary = {
      model: body.model,
      input: Array.isArray(body.input) ? `array[${body.input.length}]` : "string",
      inputChars: Array.isArray(body.input)
        ? body.input.reduce((n, t) => n + (typeof t === "string" ? t.length : 0), 0)
        : String(body.input || "").length,
      dimensions: body.dimensions ?? null,
      encoding_format: body.encoding_format || "float",
    };

    if (result.success) {
      const usage = resolveEmbeddingUsage(result.usage, body.input);
      // Probes must not pollute production usage history.
      if (usage && !isTestRequest) {
        // Recorded through the shared ledger writer so embeddings sit in the
        // same table/shape as the classifier and the audio/image capabilities.
        saveCapabilityUsage({
          provider,
          model,
          connectionId: credentials.connectionId,
          apiKey,
          account: credentials.connectionName,
          endpoint: url.pathname,
          tokens: usage,
          callKind: "embedding",
          latencyMs,
          request: requestSummary,
          response: result.summary || null,
        });
      }
      return result.response;
    }

    // Failed attempts were invisible in both ledgers. They still burned upstream
    // quota and are exactly what an operator needs to see, so record them with
    // the upstream status preserved.
    if (!isTestRequest) {
      saveCapabilityUsage({
        provider,
        model,
        connectionId: credentials.connectionId,
        apiKey,
        account: credentials.connectionName,
        endpoint: url.pathname,
        callKind: "embedding",
        status: result.status || "error",
        error: result.error || "Embeddings request failed",
        latencyMs,
        request: requestSummary,
      });
    }

    // Probes never mutate production account state (locks, cooldowns).
    const { shouldFallback } = isTestRequest
      ? { shouldFallback: true }
      : await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model, result.resetsAtMs, null, result.rawBody || result.extra?.rawBody);

    if (shouldFallback) {
      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${result.status}), trying fallback`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      if (excludeConnectionIds.size >= MAX_FALLBACK_ATTEMPTS) {
        log.warn("FALLBACK", `Reached maximum fallback attempts (${MAX_FALLBACK_ATTEMPTS}), stopping`);
        return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, `Max fallback attempts (${MAX_FALLBACK_ATTEMPTS}) reached: ${lastError}`);
      }
      continue;
    }

    return result.response || errorResponse(
      result.status || HTTP_STATUS.BAD_GATEWAY,
      result.error || "Embeddings request failed",
    );
  }
}

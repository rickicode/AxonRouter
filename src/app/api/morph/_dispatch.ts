import { withOtelSpan } from "@/lib/observability/otel";
import { MORPH_CAPABILITY_UPSTREAMS } from "@/lib/morphCapabilityUpstreams";
import {
  createMorphDispatchError,
  executeWithMorphKeyFailover,
} from "@/lib/morph/keySelection";
import { buildMorphKeyStatusPatch } from "@/app/api/morph/test-key/shared";
import { getDefaultMorphModel, saveMorphUsage } from "@/lib/morphUsageDb";
import { trackPendingRequest } from "@/lib/usageDb";

type LocalDbModule = typeof import("@/lib/localDb");

async function loadLocalDb(): Promise<LocalDbModule> {
  return import("@/lib/localDb");
}

const MORPH_ERROR_TYPES = {
  400: { type: "invalid_request_error", code: "bad_request" },
  401: { type: "authentication_error", code: "invalid_api_key" },
  402: { type: "billing_error", code: "payment_required" },
  403: { type: "permission_error", code: "insufficient_quota" },
  404: { type: "invalid_request_error", code: "model_not_found" },
  429: { type: "rate_limit_error", code: "rate_limit_exceeded" },
  500: { type: "server_error", code: "internal_server_error" },
  502: { type: "server_error", code: "bad_gateway" },
  503: { type: "server_error", code: "service_unavailable" },
  504: { type: "server_error", code: "gateway_timeout" },
};

const MORPH_QWEN35_MIN_MAX_TOKENS = 96;
const MORPH_QWEN36_MIN_MAX_TOKENS = 64;
const MORPH_MINIMAX_MIN_MAX_TOKENS = 64;
const MORPH_DEFAULT_MAX_TOKENS = 16384;
const ANSI_PINK = "\x1b[38;5;205m";
const ANSI_RESET = "\x1b[0m";
const MORPH_UPSTREAM_HEADERS = {
  "Accept-Encoding": "identity",
};
const CONTEXT_LIMIT_PATTERNS = [
  "maximum context length",
  "max context length",
  "context length of",
  "requested token count exceeds",
  "context window",
];
const RATE_LIMIT_PATTERNS = [
  "rate limit",
  "rate limited",
  "too many requests",
  "retry later",
  "slow down",
];

function buildUpstreamUrl(baseUrl, upstreamPath) {
  return new URL(upstreamPath, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function normalizeMorphManagedModel(model) {
  if (typeof model !== "string") return null;
  const normalized = model.trim();
  if (!normalized) return null;
  return normalized.startsWith("morph/") ? normalized.slice("morph/".length) : normalized;
}

function inferMorphModel(payload, capability) {
  const normalizedModel = normalizeMorphManagedModel(payload?.morphRoute?.requestedModel || payload?.model);
  if (normalizedModel) {
    return normalizedModel;
  }

  return getDefaultMorphModel(capability);
}

function normalizeUsageTokens(usage: any = {}) {
  const inputTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0) || 0;
  const outputTokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0) || 0;

  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
}

function getMorphRequestPath(req) {
  return req.nextUrl?.pathname || new URL(req.url).pathname;
}

function getMorphRequestSource(req) {
  const pathname = getMorphRequestPath(req);
  return pathname.startsWith("/v1/") ? "v1" : pathname.startsWith("/morphllm/") ? "morphllm" : "morph-api";
}

function getMorphClientEndpoint(req) {
  return getMorphRequestPath(req);
}

function shouldSyncSuccessfulMorphKeyState(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  return entry.status !== "active"
    || entry.isExhausted === true
    || Boolean(entry.lastError);
}

function logMorphEndpointAccess(req, requestLabel, requestPayload, upstreamPath) {
  const pathname = getMorphRequestPath(req);
  if (!pathname.startsWith("/morphllm")) {
    return;
  }

  const fallbackCapability = typeof requestLabel === "string" && requestLabel.startsWith("morph:")
    ? requestLabel.slice("morph:".length)
    : null;
  const model = typeof requestPayload?.model === "string" && requestPayload.model.trim()
    ? requestPayload.model.trim()
    : getDefaultMorphModel(fallbackCapability);
  const routeMeta = requestPayload?.morphRoute && typeof requestPayload.morphRoute === "object"
    ? requestPayload.morphRoute
    : null;
  const upstreamLabel = upstreamPath ? ` upstream=${upstreamPath}` : "";
  const routeLabel = routeMeta
    ? ` requested=${routeMeta.requestedModel || model} resolved=${routeMeta.resolvedModel || model} route=${routeMeta.routeSource || "unknown"}${routeMeta.reason ? ` reason=${routeMeta.reason}` : ""}`
    : "";

  console.log(`${ANSI_PINK}[morph] ${req.method || "POST"} ${pathname}${upstreamLabel} model=${model}${routeLabel}${ANSI_RESET}`);
}

function parseMorphRequestPayload(requestBody) {
  if (!requestBody) {
    return null;
  }

  try {
    return JSON.parse(requestBody);
  } catch {
    return null;
  }
}

function normalizeMorphRequestPayload(payload, capability) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const normalizedModel = normalizeMorphManagedModel(payload.model) || getDefaultMorphModel(capability);
  const nextPayload = {
    ...payload,
    model: normalizedModel,
  };
  const requestedMaxTokens = Number(nextPayload.max_tokens);

  if (normalizedModel === "morph-qwen35-397b") {
    if (Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0) {
      nextPayload.max_tokens = Math.max(requestedMaxTokens, MORPH_QWEN35_MIN_MAX_TOKENS);
    } else if (nextPayload.max_tokens == null) {
      nextPayload.max_tokens = MORPH_DEFAULT_MAX_TOKENS;
    }
  }

  if (normalizedModel === "morph-qwen36-27b") {
    if (Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0) {
      nextPayload.max_tokens = Math.max(requestedMaxTokens, MORPH_QWEN36_MIN_MAX_TOKENS);
    } else if (nextPayload.max_tokens == null) {
      nextPayload.max_tokens = MORPH_DEFAULT_MAX_TOKENS;
    }
  }

  if (normalizedModel === "morph-minimax27-230b") {
    if (Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0) {
      nextPayload.max_tokens = Math.max(requestedMaxTokens, MORPH_MINIMAX_MIN_MAX_TOKENS);
    } else if (nextPayload.max_tokens == null) {
      nextPayload.max_tokens = MORPH_DEFAULT_MAX_TOKENS;
    }
  }

  return nextPayload;
}

function resolveMorphUsageCategory(requestPayload, capability) {
  const normalizedModel = normalizeMorphManagedModel(requestPayload?.model);
  if (normalizedModel && capability !== "compact" && capability !== "warpgrep") {
    return "fast-model";
  }
  return "request";
}

function buildMorphErrorBody(statusCode, message, codeOverride, extras = {}) {
  const errorInfo = MORPH_ERROR_TYPES[statusCode]
    || (statusCode >= 500
      ? { type: "server_error", code: "internal_server_error" }
      : { type: "invalid_request_error", code: "bad_request" });

  return {
    error: {
      message,
      type: errorInfo.type,
      code: codeOverride || errorInfo.code,
      ...extras,
    },
  };
}

function parseJsonObject(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getMorphErrorMessage(responseText, status) {
  const parsed = parseJsonObject(responseText);
  const message = parsed?.error?.message || parsed?.message || parsed?.error;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (typeof responseText === "string" && responseText.trim()) return responseText.trim();
  return `Morph upstream error: ${status}`;
}

function parseRetryAfterMs(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(Math.ceil(seconds * 1000), 0);
  }
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) {
    return Math.max(timestamp - Date.now(), 0);
  }
  return null;
}

function parseResetsAtMsFromMessage(message) {
  if (typeof message !== "string") return null;
  const epochMatch = message.match(/resets?_at[^\d]*(\d{13})/i);
  if (epochMatch) {
    const ms = Number(epochMatch[1]);
    return Number.isFinite(ms) ? ms : null;
  }

  const isoMatch = message.match(/(20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)/);
  if (isoMatch) {
    const ms = Date.parse(isoMatch[1]);
    return Number.isFinite(ms) ? ms : null;
  }

  return null;
}

function classifyMorphError(status, message) {
  const normalized = String(message || "").toLowerCase();
  const isContextLength = status === 400 && CONTEXT_LIMIT_PATTERNS.some((pattern) => normalized.includes(pattern));
  const isRateLimited = status === 429 || RATE_LIMIT_PATTERNS.some((pattern) => normalized.includes(pattern));

  return {
    isContextLength,
    isRateLimited,
  };
}

function buildMorphNormalizedErrorResponse(response, responseText) {
  const status = Number(response?.status) || 500;
  const message = getMorphErrorMessage(responseText, status);
  const { isContextLength, isRateLimited } = classifyMorphError(status, message);
  const responseHeaders = new Headers({
    "Content-Type": "application/json",
  });

  const upstreamRetryAfter = response?.headers?.get("Retry-After") || "";
  const retryAfterMs = parseRetryAfterMs(upstreamRetryAfter);
  const resetsAtMs = parseResetsAtMsFromMessage(message);
  let retryAfterSeconds = null;

  if (retryAfterMs !== null) {
    retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    responseHeaders.set("Retry-After", String(retryAfterSeconds));
  } else if (resetsAtMs && resetsAtMs > Date.now()) {
    retryAfterSeconds = Math.max(1, Math.ceil((resetsAtMs - Date.now()) / 1000));
    responseHeaders.set("Retry-After", String(retryAfterSeconds));
  }

  if (!isContextLength && !isRateLimited) {
    return null;
  }

  let body;
  if (isContextLength) {
    body = buildMorphErrorBody(status, message, "context_length_exceeded");
  } else {
    const extras: any = {};
    if (resetsAtMs && resetsAtMs > Date.now()) extras.resets_at = new Date(resetsAtMs).toISOString();
    if (retryAfterSeconds !== null) extras.retry_after_seconds = retryAfterSeconds;
    body = buildMorphErrorBody(status, message, "rate_limit_exceeded", extras);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function shouldBufferMorphResponse(response, requestPayload) {
  if (!response?.ok) return true;
  if (requestPayload?.stream === true) return false;
  const contentType = String(response.headers?.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/event-stream")) return false;
  return contentType.includes("application/json");
}

async function readResponseTextSafely(response, context) {
  if (!response) {
    return null;
  }

  try {
    return await response.clone().text();
  } catch (error) {
    console.warn(`[morph] Skipping ${context} body read:`, error);
    return null;
  }
}

function doesMorphKeyPatchChange(entry, patch) {
  if (!entry || !patch) return false;
  return entry.status !== patch.status
    || entry.isExhausted !== patch.isExhausted
    || (entry.lastError || "") !== (patch.lastError || "")
    || (entry.nextRetryAt || null) !== (patch.nextRetryAt || null);
}

async function updateMorphKeyState(email, patch) {
  if (!email) return false;

  const { atomicUpdateSettings } = await loadLocalDb();
  let changed = false;
  await atomicUpdateSettings((current) => {
    const morph = current?.morph || {};
    const apiKeys = Array.isArray(morph.apiKeys) ? morph.apiKeys : [];
    const nextApiKeys = apiKeys.map((entry) => {
      if (entry?.email !== email) {
        return entry;
      }

      if (!doesMorphKeyPatchChange(entry, patch)) {
        return entry;
      }

      changed = true;
      return { ...entry, ...patch };
    });

    if (!changed) {
      return current;
    }

    return {
      ...current,
      morph: {
        ...morph,
        apiKeys: nextApiKeys,
      },
    };
  });

  return changed;
}

async function applyMorphResponseKeyState(email, status, responseText) {
  if (!email) return;

  const patch = buildMorphKeyStatusPatch({
    status,
    responseText,
    fallbackLabel: `HTTP ${status}`,
  });

  await updateMorphKeyState(email, patch);
}

async function persistMorphUsage({ capability, req, requestPayload, response, responseText, error, apiKey, email }) {
  const model = inferMorphModel(requestPayload, capability);
  let usagePayload = null;

  if (responseText) {
    try {
      usagePayload = JSON.parse(responseText)?.usage || null;
    } catch {
      usagePayload = null;
    }
  }

  const status = response && response.ok ? "ok" : "error";

  return saveMorphUsage({
    capability,
    entrypoint: getMorphClientEndpoint(req),
    source: getMorphRequestSource(req),
    method: req.method || "POST",
    model,
    requestedModel: typeof requestPayload?.morphRoute?.requestedModel === "string"
      ? requestPayload.morphRoute.requestedModel
      : (typeof requestPayload?.model === "string" ? requestPayload.model : null),
    apiKey,
    apiKeyLabel: email || "Unknown email",
    upstreamStatus: response?.status ?? null,
    status,
    tokens: normalizeUsageTokens(usagePayload || {}),
    error: error ? String(error?.message || error) : null,
    category: resolveMorphUsageCategory(requestPayload, capability),
    metadata: requestPayload?.morphContext && typeof requestPayload.morphContext === "object"
      ? {
        cleanApplyMode: requestPayload.morphContext.cleanApplyMode === true,
        executionPayloadMode: requestPayload.morphContext.executionPayloadMode || null,
        compactedForCleanApply: requestPayload.morphContext.compactedForCleanApply === true,
        compactSavedMessages: Number(requestPayload.morphContext.compactSavedMessages || 0) || 0,
        compactOriginalPrefixMessages: Number(requestPayload.morphContext.compactOriginalPrefixMessages || 0) || 0,
        compactedPrefixMessages: Number(requestPayload.morphContext.compactedPrefixMessages || 0) || 0,
        compactQuery: requestPayload.morphContext.compactQuery || null,
        estimatedTokenCount: Number(requestPayload.morphContext.estimatedTokenCount || 0) || 0,
        internalFastApplyIntercepted: requestPayload.morphContext.internalFastApplyIntercepted === true,
        internalFastApplyTargetPath: requestPayload.morphContext.internalFastApplyTargetPath || null,
        internalFastApplyModel: requestPayload.morphContext.internalFastApplyModel || null,
      }
      : null,
  }, { propagateError: true });
}

export async function dispatchMorphCapability({ capability, req, morphSettings, requestBody: providedRequestBody = null, requestPayload: providedRequestPayload = undefined, upstreamTarget: providedUpstreamTarget = null, requestLabel: providedRequestLabel = null }) {
  const upstreamTarget = providedUpstreamTarget || MORPH_CAPABILITY_UPSTREAMS[capability];

  if (!upstreamTarget) {
    throw new Error(`Unsupported Morph capability: ${capability}`);
  }

  const requestLabel = providedRequestLabel || `morph:${capability}`;
  const clientEndpoint = getMorphClientEndpoint(req);
  const requestSource = getMorphRequestSource(req);
  const upstreamUrl = buildUpstreamUrl(morphSettings.baseUrl, upstreamTarget.path);
  let trackedModel = requestLabel;

  let requestBody = typeof providedRequestBody === "string" ? providedRequestBody : null;
  let requestPayload = providedRequestPayload;
  let usedApiKey = null;
  let usedEmail = null;

  return withOtelSpan("morph.dispatch", {
    "axonrouter.morph.capability": capability,
    "axonrouter.morph.request_label": requestLabel,
    "axonrouter.morph.client_endpoint": clientEndpoint,
    "axonrouter.morph.request_source": requestSource,
    "axonrouter.morph.upstream_path": upstreamTarget.path,
    "axonrouter.morph.upstream_method": upstreamTarget.method,
  }, async () => {
    try {
      if (requestBody === null) {
        requestBody = await withOtelSpan("morph.read_body", {
          "axonrouter.morph.capability": capability,
        }, () => req.text().catch((cause) => {
          throw createMorphDispatchError("Failed to read Morph request body", {
            cause,
            dispatchStarted: false,
          });
        }));
      }

      if (requestPayload === undefined) {
        requestPayload = await withOtelSpan("morph.parse_payload", {
          "axonrouter.morph.capability": capability,
        }, () => parseMorphRequestPayload(requestBody));
      }

      requestPayload = await withOtelSpan("morph.normalize_payload", {
        "axonrouter.morph.capability": capability,
      }, () => normalizeMorphRequestPayload(requestPayload, capability));
      if (requestPayload && typeof requestPayload === "object") {
        requestBody = JSON.stringify(requestPayload);
      }

      trackedModel = normalizeMorphManagedModel(requestPayload?.model) || requestLabel;
      trackPendingRequest(trackedModel, "morph", capability, true, false, { endpoint: clientEndpoint, target: upstreamTarget.path });

      logMorphEndpointAccess(req, requestLabel, requestPayload, upstreamTarget.path);

      const upstreamResponse = await withOtelSpan("morph.upstream", {
        "axonrouter.morph.capability": capability,
        "axonrouter.morph.model": trackedModel,
      }, () => executeWithMorphKeyFailover({
        apiKeys: morphSettings?.apiKeys,
        roundRobinEnabled: morphSettings?.roundRobinEnabled,
        rotationKey: capability,
        execute: async ({ apiKey, email, attempt, totalKeys }) => {
          usedApiKey = apiKey;
          usedEmail = email;
          const keyEntry = Array.isArray(morphSettings?.apiKeys)
            ? morphSettings.apiKeys.find((entry) => entry?.email === email)
            : null;
          const response = await withOtelSpan("morph.upstream.fetch", {
            "axonrouter.morph.capability": capability,
            "axonrouter.morph.key_email": email || "",
            "axonrouter.morph.key_attempt": attempt + 1,
            "axonrouter.morph.key_total": totalKeys,
            "axonrouter.morph.model": trackedModel,
          }, () => fetch(
            upstreamUrl,
            {
              method: upstreamTarget.method,
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                ...MORPH_UPSTREAM_HEADERS,
              },
              body: requestBody,
            }
          ).catch((cause) => {
            throw createMorphDispatchError("Morph upstream request failed", {
              cause,
              dispatchStarted: true,
            });
          }));

          if (response.ok) {
            if (shouldSyncSuccessfulMorphKeyState(keyEntry)) {
              const nextPatch = buildMorphKeyStatusPatch({
                status: response.status,
                responseText: "",
                fallbackLabel: `HTTP ${response.status}`,
              });
              void updateMorphKeyState(email, nextPatch).catch((stateError) => {
                console.error("[morph] Failed to persist successful key state:", stateError);
              });
            }
            return response;
          }

          const responseText = await readResponseTextSafely(response, "error");
          const nextPatch = buildMorphKeyStatusPatch({
            status: response.status,
            responseText: responseText || "",
            fallbackLabel: `HTTP ${response.status}`,
          });

          await updateMorphKeyState(email, nextPatch);

          if ((nextPatch.status === "inactive" || nextPatch.isExhausted === true) && attempt < totalKeys - 1) {
            throw createMorphDispatchError(`Morph upstream rejected key ${email || "unknown"}`, {
              status: response.status,
              code: nextPatch.status === "inactive" ? "MORPH_API_KEY_INVALID" : "MORPH_API_KEY_EXHAUSTED",
              dispatchStarted: true,
            });
          }

          return response;
        },
      } as any));

      const responseText = shouldBufferMorphResponse(upstreamResponse, requestPayload)
        ? await withOtelSpan("morph.buffer_response", {
          "axonrouter.morph.capability": capability,
          "axonrouter.morph.model": trackedModel,
        }, () => readResponseTextSafely(upstreamResponse, "usage"))
        : null;

      const persistUsagePromise = withOtelSpan("morph.persist_usage", {
        "axonrouter.morph.capability": capability,
        "axonrouter.morph.model": trackedModel,
        "axonrouter.morph.key_email": usedEmail || "",
      }, () => persistMorphUsage({
        capability,
        req,
        requestPayload,
        response: upstreamResponse,
        responseText,
        error: null,
        apiKey: usedApiKey,
        email: usedEmail,
      })).catch((persistError) => {
        console.error("[morph] Failed to persist Morph usage:", persistError);
      });

      trackPendingRequest(trackedModel, "morph", capability, false, !upstreamResponse.ok, { endpoint: clientEndpoint, target: upstreamTarget.path, upstreamStatus: upstreamResponse.status });

      void persistUsagePromise;

      if (!upstreamResponse.ok) {
        const normalizedErrorResponse = buildMorphNormalizedErrorResponse(upstreamResponse, responseText);
        if (normalizedErrorResponse) {
          return normalizedErrorResponse;
        }
      }

      return upstreamResponse;
    } catch (error) {
      if (requestBody) {
        try {
          await withOtelSpan("morph.persist_usage_error", {
            "axonrouter.morph.capability": capability,
            "axonrouter.morph.model": trackedModel,
            "axonrouter.morph.key_email": usedEmail || "",
          }, () => persistMorphUsage({
            capability,
            req,
            requestPayload,
            response: null,
            responseText: null,
            error,
            apiKey: usedApiKey,
            email: usedEmail,
          }));
        } catch (persistError) {
          console.error("[morph] Failed to persist Morph usage after error:", persistError);
        }
      }

      trackPendingRequest(trackedModel, "morph", capability, false, true, { endpoint: clientEndpoint, target: upstreamTarget.path, source: requestSource });
      throw error;
    }
  });
}

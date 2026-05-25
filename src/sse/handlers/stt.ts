import {
  extractApiKey,
  isValidApiKey,
  hasApiKeys,
  getProviderCredentials,
  markAccountUnavailable,
} from "../services/sttAuth";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { checkRateLimit, getRateLimitHeaders, OPEN_MODE_LIMIT_PER_MIN, DEFAULT_KEY_LIMIT_PER_MIN } from "@/lib/rateLimiter";
import { getModelInfo } from "../services/model";
import { handleSttCore } from "../../../open-sse/handlers/sttCore";
import { errorResponse, unavailableResponse } from "../../../open-sse/utils/error";
import { HTTP_STATUS } from "../../../open-sse/config/runtimeConfig";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import * as log from "../utils/logger";

const CREDENTIALED_PROVIDERS = new Set(
  Object.entries(AI_PROVIDERS)
    .filter(([, provider]) => {
      const p: any = provider;
      return Array.isArray(p?.serviceKinds) && p.serviceKinds.includes("stt") && !p.noAuth && p?.sttConfig?.authType !== "none";
    })
    .map(([id]) => id)
);

export async function handleStt(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid multipart form data");
  }

  const modelStr = formData.get("model");
  log.request("POST", `/v1/audio/transcriptions | ${modelStr}`);

  const settings = await getCurrentSettings();
  const apiKey = await extractApiKey(request);
  const keysConfigured = await hasApiKeys();
  if (keysConfigured) {
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  // Rate limiting
  const rateLimitId = apiKey || request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers?.get('x-real-ip') || 'unknown-ip';
  const rateLimitMax = apiKey ? (settings?.rateLimitPerKey || DEFAULT_KEY_LIMIT_PER_MIN) : OPEN_MODE_LIMIT_PER_MIN;
  const rateResult = checkRateLimit(rateLimitId, rateLimitMax);
  if (!rateResult.allowed) {
    return new Response(JSON.stringify({ error: { message: "Rate limit exceeded", type: "rate_limit_error" } }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...getRateLimitHeaders(rateResult, rateLimitMax) },
    });
  }

  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  if (!formData.get("file")) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: file");

  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");

  const { provider, model } = modelInfo;
  log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);

  if (!CREDENTIALED_PROVIDERS.has(provider)) {
    const result: any = await handleSttCore({ provider, model, formData, credentials: null });
    if (result.success) return result.response;
    return errorResponse(result.status || HTTP_STATUS.BAD_GATEWAY, result.error || "STT failed");
  }

  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model, null, apiKey ? { requestApiKey: apiKey } : null);

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const msg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        return unavailableResponse(status, `[${provider}/${model}] ${msg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const result: any = await handleSttCore({ provider, model, formData, credentials });

    if (result.success) return result.response;

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model);
    if (shouldFallback) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }
    return result.response || errorResponse(result.status, result.error);
  }
}

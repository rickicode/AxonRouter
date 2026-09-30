import { saveRequestUsage, appendRequestLog, saveRequestDetail } from "@/lib/usageDb.js";
import { COLORS } from "../../utils/stream.js";
import { canonicalizeUsage } from "../../utils/usageTracking.js";

const OPTIONAL_PARAMS = [
  "temperature", "top_p", "top_k",
  "max_tokens", "max_completion_tokens",
  "thinking", "reasoning", "enable_thinking",
  "presence_penalty", "frequency_penalty",
  "seed", "stop", "tools", "tool_choice",
  "response_format", "prediction", "store", "metadata",
  "n", "logprobs", "top_logprobs", "logit_bias",
  "user", "parallel_tool_calls"
];

export function extractRequestConfig(body, stream) {
  const config = { messages: body.messages || [], model: body.model, stream };
  for (const param of OPTIONAL_PARAMS) {
    if (body[param] !== undefined) config[param] = body[param];
  }
  return config;
}

export function extractUsageFromResponse(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return null;

  // Claude format
  // Note: OpenAI Responses usage ({input_tokens, input_tokens_details:{cached_tokens}})
  // also matches this branch. Its prompt is cache-INCLUSIVE and its cache rides in
  // input_tokens_details, so emit it as cached_tokens — the convention
  // canonicalizeUsage() passes through without folding. Reading it here keeps
  // cache accounting correct for /v1/responses and codex traffic.
  if (responseBody.usage?.input_tokens !== undefined) {
    return {
      prompt_tokens: responseBody.usage.input_tokens || 0,
      completion_tokens: responseBody.usage.output_tokens || 0,
      cached_tokens: responseBody.usage.cached_tokens ?? responseBody.usage.input_tokens_details?.cached_tokens,
      cache_read_input_tokens: responseBody.usage.cache_read_input_tokens,
      cache_creation_input_tokens: responseBody.usage.cache_creation_input_tokens
    };
  }

  // OpenAI format
  if (responseBody.usage?.prompt_tokens !== undefined) {
    return {
      prompt_tokens: responseBody.usage.prompt_tokens || 0,
      completion_tokens: responseBody.usage.completion_tokens || 0,
      cached_tokens: responseBody.usage.cached_tokens ?? responseBody.usage.prompt_tokens_details?.cached_tokens,
      reasoning_tokens: responseBody.usage.completion_tokens_details?.reasoning_tokens
    };
  }

  // Gemini format. Antigravity / gemini-cli wrap the payload in { response: {...} }.
  const usageMetadata = responseBody.usageMetadata || responseBody.response?.usageMetadata;
  if (usageMetadata) {
    return {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0,
      cached_tokens: usageMetadata.cachedContentTokenCount || 0,
      reasoning_tokens: usageMetadata.thoughtsTokenCount || 0
    };
  }

  return null;
}

export function buildRequestDetail(base, overrides = {}) {
  return {
    id: overrides.id || base.id || undefined,
    provider: base.provider || "unknown",
    model: base.model || "unknown",
    connectionId: base.connectionId || undefined,
    comboName: base.comboName || overrides.comboName || undefined,
    difficulty: base.difficulty || overrides.difficulty || undefined,
    timestamp: overrides.timestamp || base.timestamp || new Date().toISOString(),
    latency: base.latency || { ttft: 0, total: 0 },
    tokens: base.tokens || { prompt_tokens: 0, completion_tokens: 0 },
    request: base.request,
    providerRequest: base.providerRequest || null,
    providerResponse: base.providerResponse || null,
    response: base.response || {},
    // Reader-side queries look for data->>'error' (see requestDetailsRepo's
    // error projection), so an empty response needs the reason at the root, not
    // only inside response.
    error: base.error ? String(base.error.message || base.error) : undefined,
    pxpipe: base.pxpipe || undefined,
    status: base.status || "success",
    endpoint: overrides.endpoint || base.endpoint || undefined,
    ...overrides
  };
}

// Build the "done" summary: duration, ttft, in/out tokens with cache breakdown
export function formatDoneLine({ usage, latency }) {
  const u = usage || {};
  const inTok = u.prompt_tokens ?? u.input_tokens ?? 0;
  const outTok = u.completion_tokens ?? u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? u.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheCreate = u.cache_creation_input_tokens ?? 0;
  let inStr = `IN ${inTok}`;
  if (cacheRead || cacheCreate) {
    const parts = [];
    if (cacheRead) parts.push(`↻${cacheRead}`);
    if (cacheCreate) parts.push(`+${cacheCreate}`);
    inStr += ` (CACHE ${parts.join(" ")})`;
  }
  const ttftStr = latency?.ttft ? ` · TTFT ${latency.ttft}ms` : "";
  return `DONE ${latency?.total ?? 0}ms${ttftStr} · ${inStr} · OUT ${outTok}`;
}

export function saveUsageStats({
  provider, model, tokens, connectionId, apiKey, endpoint,
  label = "USAGE", silent = false, isStream, isTestRequest = false,
  comboName = null, requestId = null, latency = null, difficulty = null,
  // Capability/classifier support.
  //   callKind        — dashboard discriminator (chat | classifier | judge |
  //                     embedding | tts | stt | image | video | search | fetch)
  //   status          — persisted verbatim, so 4xx/5xx/timeout rows are visible
  //   allowZeroTokens — non-chat calls that report no usage still produce a row
  //   meta            — extra structured context; coerced to an object because
  //                     usage_history.meta is read with jsonb_object_keys
  status = "ok", callKind = null, allowZeroTokens = false, error = null, meta: extraMeta = null,
}) {
  if (isTestRequest) return;
  if (!tokens || typeof tokens !== "object") tokens = {};

  const inTokens = tokens.input_tokens ?? tokens.prompt_tokens ?? 0;
  const outTokens = tokens.output_tokens ?? tokens.completion_tokens ?? 0;

  // Zero-token rows are dropped for chat (an empty completion is not a billable
  // call) but must survive for capabilities: a classifier/audio/image call that
  // reports no usage still consumed upstream capacity and belongs in the ledger.
  if (!allowZeroTokens && inTokens === 0 && outTokens === 0) return;

  if (!silent) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const accountSuffix = connectionId ? ` | account=${connectionId.slice(0, 8)}...` : "";
    console.log(`${COLORS.green}[${time}] \u{1F4CA} [${label}] ${String(provider).toUpperCase()} | in=${inTokens} | out=${outTokens}${accountSuffix}${COLORS.reset}`);
  }

  // Canonicalize to one storage convention (prompt_tokens cache-inclusive) so
  // cached/cache-creation tokens survive to cost calc + stats. See canonicalizeUsage.
  const normalized = canonicalizeUsage(tokens) || {
    prompt_tokens: tokens.prompt_tokens ?? tokens.input_tokens ?? 0,
    completion_tokens: tokens.completion_tokens ?? tokens.output_tokens ?? 0
  };

  const failed = status !== "ok" && status !== "success";
  const safeExtra = extraMeta && typeof extraMeta === "object" && !Array.isArray(extraMeta) ? extraMeta : null;
  const resolvedStream = isStream !== undefined ? Boolean(isStream) : true;

  saveRequestUsage({
    provider: provider || "unknown",
    model: model || "unknown",
    tokens: normalized,
    timestamp: new Date().toISOString(),
    requestId: requestId || undefined,
    connectionId: connectionId || undefined,
    apiKey: apiKey || undefined,
    endpoint: endpoint || null,
    status,
    isStream: resolvedStream,
    meta: {
      isStream: resolvedStream,
      ...(callKind ? { callKind } : {}),
      ...(failed ? { failed: true } : {}),
      ...(error ? { error: String(typeof error === "object" ? (error.message || JSON.stringify(error)) : error).slice(0, 500) } : {}),
      ...(comboName ? { comboName } : {}),
      ...(latency ? { latency } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(safeExtra || {}),
    },
  }).catch(() => {});

  // Chat records its own full request/response detail in
  // src/sse/handlers/chat.js. Classifier and judge calls are issued internally from
  // combo.js and never reach that handler, so they produced a usage row and no
  // request row — invisible in Recent Requests and in the request-detail
  // drill-down. Record a summary row for those call kinds; the bodies stay inside
  // open-sse and are intentionally not plumbed through here.
  if (callKind && callKind !== "chat") {
    saveRequestDetail({
      provider: provider || "unknown",
      model: model || "unknown",
      connectionId: connectionId || null,
      comboName: comboName || null,
      callKind,
      endpoint: endpoint || null,
      latency: latency || {},
      tokens: normalized,
      request: {
        endpoint: endpoint || null,
        ...(difficulty ? { difficulty } : {}),
        ...(safeExtra || {}),
      },
      status: failed ? String(status) : "success",
      ...(error ? { error: String(typeof error === "object" ? (error.message || JSON.stringify(error)) : error).slice(0, 500) } : {}),
    }).catch(() => {});
  }
}

// Shared usage-ledger writer for non-chat capability calls (classifier family is
// recorded inside open-sse; everything else — embeddings, TTS, STT, image,
// video, search, fetch — records here).
//
// Every row carries meta.callKind so the dashboard can filter chat vs
// classifier vs embedding vs audio vs image, and a verbatim status so upstream
// failures (429/503/timeout) are visible as cost/burn instead of vanishing.
// Probes (x-axonrouter-test-request) never write. Writes are the same
// fire-and-forget enqueue the chat path uses — never awaited on the hot path.
import { saveRequestUsage, saveRequestDetail, trackPendingRequest } from "@/lib/usageDb.js";

const DEFAULT_TOKENS = { prompt_tokens: 0, completion_tokens: 0 };

/**
 * Register a capability call as an in-flight request and return its finisher.
 *
 * trackPendingRequest was only ever called from the chat path, so a capability
 * provider never appeared in `activeRequests` — and ProviderTopology renders an
 * empty graph unless a provider is in that set. Embeddings are structurally the
 * worst case: they finish in well under a second, so they could never be sampled
 * as "active" no matter how often the dashboard polled.
 *
 * `requestId` must be unique per attempt (the capability handlers retry on a new
 * account), so a random suffix is appended when the caller does not supply one —
 * reusing a key would let a second attempt delete the first attempt's row and
 * leave the topology flapping.
 *
 * @returns {(error?: boolean) => void} finisher; safe to call once
 */
export function beginCapabilityPending({
  model,
  provider,
  connectionId,
  apiKey = null,
  requestId = null,
  isTestRequest = false,
}) {
  if (isTestRequest) return () => {};
  const key =
    requestId ||
    `${provider}/${model}:${connectionId || "-"}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  trackPendingRequest?.(model, provider, connectionId, true, false, {
    requestId: key,
    apiKey,
    isStream: false,
  })?.catch?.(() => {});
  return (error = false) => {
    trackPendingRequest?.(model, provider, connectionId, false, error, { requestId: key })?.catch?.(() => {});
  };
}

function zeroTokens(tokens) {
  const inTok = tokens ? (tokens.prompt_tokens ?? tokens.input_tokens ?? 0) : 0;
  const outTok = tokens ? (tokens.completion_tokens ?? tokens.output_tokens ?? 0) : 0;
  return inTok === 0 && outTok === 0;
}

export function saveCapabilityUsage({
  provider,
  model,
  endpoint,
  tokens = null,
  connectionId = null,
  apiKey = null,
  comboName = null,
  account = null,
  callKind,
  status = "success",
  error = null,
  isTestRequest = false,
  latencyMs = null,
  // Compact summaries, never the raw payloads. Call sites own this shape because
  // capability bodies are mostly unusable at rest: an embeddings vector is orders
  // of magnitude larger than the entire rest of the record and tells an operator
  // nothing that {dimensions, vectorCount} does not.
  request = null,
  response = null,
}) {
  if (isTestRequest) return;
  if (!callKind) return;
  try {
    const failed = status !== "ok" && status !== "success";
    // Zero-token capability rows are kept: an audio/image/search call that
    // reports no usage still consumed upstream capacity and belongs in the
    // ledger (same contract as the classifier family in
    // open-sse/handlers/chatCore/requestDetail.js).
    const safeTokens = zeroTokens(tokens) ? { ...DEFAULT_TOKENS } : tokens;
    saveRequestUsage({
      provider: provider || "unknown",
      model: model || "unknown",
      tokens: safeTokens,
      timestamp: new Date().toISOString(),
      connectionId: connectionId || undefined,
      apiKey: apiKey || undefined,
      endpoint: endpoint || null,
      // A non-ok status flips the daily-rollup flag to failed while the
      // usage_history row keeps its status verbatim (saveRequestUsage marks
      // failed from the status; saveFailedRequest is the chat path's own
      // helper and stays untouched).
      // "success" (not "ok") is the established embeddings-path value; keep it.
      status: failed ? String(status) : "success",
      meta: {
        isStream: false,
        callKind,
        ...(failed ? { failed: true } : {}),
        ...(error ? { error: String(error).slice(0, 500) } : {}),
        ...(comboName ? { comboName } : {}),
        ...(latencyMs != null ? { latency: { total: latencyMs } } : {}),
      },
    }).catch(() => {});

    // request_details used to be written by the chat path only, so every
    // capability call had a usage row but no request row — Recent Requests and the
    // request-detail drill-down showed nothing at all for embeddings, classifier
    // or judge traffic. Record the same facts as a compact row. saveRequestDetail
    // self-gates on the observability setting, so this inherits the same
    // on/off semantics (and payload storage mode) as the chat path.
    saveRequestDetail({
      provider: provider || "unknown",
      model: model || "unknown",
      connectionId: connectionId || null,
      account: account || null,
      comboName: comboName || null,
      endpoint: endpoint || null,
      callKind,
      latency: latencyMs != null ? { total: latencyMs } : {},
      tokens: safeTokens,
      request,
      response,
      status: failed ? String(status) : "success",
      ...(error ? { error: String(error) } : {}),
    }).catch(() => {});
  } catch { /* usage writes never fail the request */ }
}

export default saveCapabilityUsage;

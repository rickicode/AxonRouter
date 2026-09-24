import { ERROR_TYPES, DEFAULT_ERROR_MESSAGES } from "../config/errorConfig.js";

/**
 * Build OpenAI-compatible error response body
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {object} Error response object
 */
export function buildErrorBody(statusCode, message) {
  const errorInfo = ERROR_TYPES[statusCode] || 
    (statusCode >= 500 
      ? { type: "server_error", code: "internal_server_error" }
      : { type: "invalid_request_error", code: "" });

  return {
    error: {
      message: message || DEFAULT_ERROR_MESSAGES[statusCode] || "An error occurred",
      type: errorInfo.type,
      code: errorInfo.code
    }
  };
}

/**
 * Create error Response object (for non-streaming)
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {Response} HTTP Response object
 */
export function errorResponse(statusCode, message) {
  return new Response(JSON.stringify(buildErrorBody(statusCode, message)), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

/**
 * Write error to SSE stream (for streaming)
 * @param {WritableStreamDefaultWriter} writer - Stream writer
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
export async function writeStreamError(writer, statusCode, message) {
  const errorBody = buildErrorBody(statusCode, message);
  const encoder = new TextEncoder();
  await writer.write(encoder.encode(`data: ${JSON.stringify(errorBody)}\n\n`));
}

/**
 * Extract precise quota reset timestamp (epoch ms) from error body, headers, or details.
 * Universal support across Google (Antigravity/Gemini), Codex, OpenAI, and other providers.
 */
export function extractQuotaResetMs(bodyText, response) {
  let resetsAtMs = null;
  const now = Date.now();

  // 1. Check Retry-After / retry-after header
  const retryHeader = response?.headers?.get?.("retry-after") || response?.headers?.get?.("Retry-After");
  if (retryHeader) {
    const sec = parseInt(retryHeader, 10);
    if (!isNaN(sec) && sec > 0) {
      resetsAtMs = now + sec * 1000;
    } else {
      const d = Date.parse(retryHeader);
      if (!isNaN(d) && d > now) resetsAtMs = d;
    }
  }

  // 2. Parse JSON error structures
  if (bodyText) {
    try {
      const json = JSON.parse(bodyText);
      const err = json?.error || json;

      // Google RPC / Antigravity error details
      const details = err?.details || json?.details;
      if (Array.isArray(details)) {
        for (const d of details) {
          if (d?.metadata?.quotaResetTimeStamp) {
            const t = Date.parse(d.metadata.quotaResetTimeStamp);
            if (!isNaN(t) && t > now) {
              resetsAtMs = t;
              break;
            }
          }
          if (d?.metadata?.quotaResetDelay) {
            const m = String(d.metadata.quotaResetDelay).match(/(\d+)h(?:(\d+)m)?(?:(\d+)s)?/i);
            if (m) {
              const h = parseInt(m[1] || "0", 10);
              const min = parseInt(m[2] || "0", 10);
              const s = parseInt(m[3] || "0", 10);
              const totalSec = h * 3600 + min * 60 + s;
              if (totalSec > 0) {
                resetsAtMs = now + totalSec * 1000;
                break;
              }
            }
          }
          if (d?.retryDelay) {
            const sec = parseFloat(String(d.retryDelay).replace("s", ""));
            if (!isNaN(sec) && sec > 0) {
              resetsAtMs = now + Math.round(sec * 1000);
              break;
            }
          }
        }
      }

      // Codex / OpenAI / generic reset fields
      if (!resetsAtMs) {
        const rawReset = err?.resets_at ?? err?.reset_at ?? err?.resetsAt ?? err?.resetAt;
        if (typeof rawReset === "number" && rawReset > 0) {
          const ms = rawReset > 1e11 ? rawReset : rawReset * 1000;
          if (ms > now) resetsAtMs = ms;
        } else if (typeof rawReset === "string") {
          const t = Date.parse(rawReset);
          if (!isNaN(t) && t > now) resetsAtMs = t;
        }
      }

      if (!resetsAtMs) {
        const rawInSec = err?.resets_in_seconds ?? err?.reset_in_seconds ?? err?.retry_after ?? err?.retryAfter;
        if (typeof rawInSec === "number" && rawInSec > 0) {
          resetsAtMs = now + rawInSec * 1000;
        }
      }
    } catch {}

    // 3. Fallback regex on string message (e.g. "Resets in 166h22m46s",
    // "resets in 2 hours", or Cline "Try again in 8h 26m" — note the space
    // between unit components, which the h/m/s groups must tolerate).
    if (!resetsAtMs) {
      const absoluteMatch = String(bodyText).match(/(?:reset|usage will reset|resets?)\s+at\s+([^\n,"]+UTC[^\n,"]*)/i);
      if (absoluteMatch) {
        const t = Date.parse(absoluteMatch[1]);
        if (!isNaN(t) && t > now) resetsAtMs = t;
      }
    }

    if (!resetsAtMs) {
      const isoMatch = String(bodyText).match(/(?:starts at|resets? at|period starts at)\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[^\s,"]+)/i);
      if (isoMatch) {
        const t = Date.parse(isoMatch[1]);
        if (!isNaN(t) && t > now) resetsAtMs = t;
      }
    }
    if (!resetsAtMs) {
      const compoundMatch = String(bodyText).match(/(?:resets?|try again)\s+in\s+(\d+)h\s*(?:(\d+)m)?\s*(?:(\d+)s)?/i);
      if (compoundMatch) {
        const h = parseInt(compoundMatch[1] || "0", 10);
        const min = parseInt(compoundMatch[2] || "0", 10);
        const s = parseInt(compoundMatch[3] || "0", 10);
        const totalSec = h * 3600 + min * 60 + s;
        if (totalSec > 0) resetsAtMs = now + totalSec * 1000;
      }
    }

    if (!resetsAtMs) {
      const resetInMatch = String(bodyText).match(/(?:resets?|try again)\s+in\s+(\d+)\s*(hour|h|min|m|s|second)/i);
      if (resetInMatch) {
        const n = parseInt(resetInMatch[1], 10);
        const unit = resetInMatch[2].toLowerCase();
        let mult = 1000;
        if (unit.startsWith("h")) mult = 3600 * 1000;
        else if (unit.startsWith("m")) mult = 60 * 1000;
        if (n > 0) resetsAtMs = now + n * mult;
      }
    }
    // Cloudflare Workers AI free daily 10,000 neurons resets at midnight UTC (pad to 00:01 UTC)
    if (!resetsAtMs && /daily free allocation|10,000 neurons/i.test(String(bodyText))) {
      const nowObj = new Date();
      const resetToday = Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth(), nowObj.getUTCDate(), 0, 1, 0, 0);
      resetsAtMs = nowObj.getTime() < resetToday
        ? resetToday
        : Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth(), nowObj.getUTCDate() + 1, 0, 1, 0, 0);
    }
  }

  return resetsAtMs;
}

/**
 * Parse upstream provider error response
 * @param {Response} response - Fetch response from provider
 * @param {object} [executor] - Optional executor with parseError() override for provider-specific parsing
 * @returns {Promise<{statusCode: number, message: string, resetsAtMs?: number}>}
 */
export async function parseUpstreamError(response, executor = null) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  // Let executor-specific parser extract provider-specific fields (e.g. codex resetsAtMs)
  if (executor && typeof executor.parseError === "function") {
    try {
      const parsed = executor.parseError(response, bodyText);
      if (parsed && typeof parsed === "object") {
        const msg = parsed.message || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`;
        const resetsAtMs = parsed.resetsAtMs || extractQuotaResetMs(bodyText, response);
          return {
            statusCode: parsed.status || response.status,
            message: msg,
            resetsAtMs,
            upstreamStatus: parsed.upstreamStatus || parsed.status || response.status,
            upstreamCode: parsed.upstreamCode || null,
          // Executors declare IP/pool-scoped failures (e.g. per-IP rate limits)
          // here; chatCore completes poolId/scope and retries via another pool.
          poolScoped: parsed.poolScoped,
          rawBody: parsed.rawBody || bodyText,
        };
      }
    } catch { /* fall through to default parsing */ }
  }

  let message = "";
  try {
    const json = JSON.parse(bodyText);
    message = json.error?.message || json.message || json.error || bodyText;
  } catch {
    message = bodyText;
  }

  const messageStr = typeof message === "string" ? message : JSON.stringify(message);
  const finalMessage = messageStr || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`;
  const resetsAtMs = extractQuotaResetMs(bodyText, response);

  let upstreamStatus = response.status;
  let upstreamCode = null;
  try {
    const parsed = JSON.parse(bodyText);
    const nested = parsed?.error?.message && typeof parsed.error.message === "string"
      ? JSON.parse(parsed.error.message)
      : parsed;
    upstreamCode = nested?.error?.code || nested?.code || null;
    if (Number.isFinite(Number(upstreamCode))) upstreamStatus = Number(upstreamCode);
  } catch {}
  // Detect IP-scoped / rate-limited upstream errors (e.g. Cline Free, OpenCode, Decart)
  // When a proxy pool is in use, declare poolScoped so chatCore retries via another pool
  // instead of locking the account or failing the request immediately!
  let poolScoped = null;
  const lowerBody = bodyText.toLowerCase();
  if (
    response.status === 429 ||
    upstreamStatus === 429 ||
    /daily free limit|rate.?limit exceeded|too many requests|temporarily rate-limited|upstream_provider_shared_pool|overloaded/i.test(lowerBody)
  ) {
    poolScoped = { reason: "egress_rate_limited" };
  }

  return {
    statusCode: response.status,
    message: finalMessage,
    resetsAtMs,
    upstreamStatus,
    upstreamCode,
    poolScoped,
    rawBody: bodyText,
  };
}

/**
 * Create error result for chatCore handler
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {number} [resetsAtMs] - Optional precise cooldown expiry (ms epoch) for provider-specific quota errors
 * @param {object} [extra] - Optional provider metadata to preserve across handlers
 * @returns {{ success: false, status: number, error: string, response: Response, resetsAtMs?: number, extra?: object }}
 */
export function createErrorResult(statusCode, message, resetsAtMs, extra = {}) {
  return {
    success: false,
    status: statusCode,
    error: message,
    resetsAtMs,
    extra,
    rawBody: extra?.rawBody || null,
    response: errorResponse(statusCode, message)
  };
}

/**
 * Create unavailable response when all accounts are rate limited
 * @param {number} statusCode - Original error status code
 * @param {string} message - Error message (without retry info)
 * @param {string} retryAfter - ISO timestamp when earliest account becomes available
 * @param {string} retryAfterHuman - Human-readable retry info e.g. "reset after 30s"
 * @returns {Response}
 */
export function unavailableResponse(statusCode, message, retryAfter, retryAfterHuman, metadata = {}) {
  const retryAfterMs = retryAfter ? new Date(retryAfter).getTime() : NaN;
  const retryAfterSec = Number.isFinite(retryAfterMs) ? Math.max(Math.ceil((retryAfterMs - Date.now()) / 1000), 1) : null;
  const msg = retryAfterHuman ? `${message} (${retryAfterHuman})` : message;
  const error = {
    message: msg,
    type: "service_unavailable",
    code: metadata.code || "SERVICE_UNAVAILABLE",
    ...(metadata.provider ? { provider: metadata.provider } : {}),
    ...(metadata.model ? { model: metadata.model } : {}),
    ...(metadata.statusBreakdown ? { status_breakdown: metadata.statusBreakdown } : {}),
    ...(retryAfter ? { retry_after: retryAfter } : {}),
  };
  return new Response(
    JSON.stringify({ error }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        ...(retryAfterSec != null ? { "Retry-After": String(retryAfterSec) } : {}),
      }
    }
  );
}

/**
 * Some upstreams (notably Google/Gemini-shaped gateways) nest a full OpenAI-style
 * error envelope inside `error.message`, so a raw JSON blob — instead of the real
 * reason — ends up surfacing to the client. Peel up to 3 layers of
 * `{"error":{"message":…}}` so the text a user reads is the actual message.
 * @param {string} text - Candidate message string
 * @returns {string} Unwrapped message
 */
export function unwrapJsonMessage(text) {
  if (typeof text !== "string") return text;
  let current = text.trim();
  for (let i = 0; i < 3; i++) {
    if (!current.startsWith("{") || !current.endsWith("}")) break;
    let inner;
    try { inner = JSON.parse(current); } catch { break; }
    const next = inner?.error?.message
      || inner?.error?.error?.message
      || (typeof inner?.error === "string" ? inner.error : null)
      || inner?.message;
    if (typeof next !== "string" || !next.trim() || next.trim() === current) break;
    current = next.trim();
  }
  return current;
}

/**
 * Format provider error with context
 * @param {Error} error - Original error
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {number|string} statusCode - HTTP status code or error code
 * @returns {string} Formatted error message
 */
export function formatProviderError(error, provider, model, statusCode) {
  const code = statusCode || error.code || "FETCH_FAILED";
  const message = unwrapJsonMessage(error.message || "Unknown error");
  // Expose low-level cause (e.g. UND_ERR_SOCKET, ECONNRESET, ETIMEDOUT) for diagnosing fetch failures
  const causeCode = error.cause?.code;
  const causeMsg = error.cause?.message;
  const causeStr = causeCode || causeMsg ? ` (cause: ${[causeCode, causeMsg].filter(Boolean).join(": ")})` : "";
  const providerModelStr = provider && model ? ` · ${provider}/${model}` : (provider ? ` · ${provider}` : "");
  return `[${code}${providerModelStr}]: ${message}${causeStr}`;
}

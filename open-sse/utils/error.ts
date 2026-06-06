import { ERROR_TYPES, DEFAULT_ERROR_MESSAGES } from "../config/errorConfig";

/**
 * Sanitize error messages to prevent leaking sensitive provider details
 */
function sanitizeErrorMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return msg;
  return msg
    .replace(/org-[a-zA-Z0-9]{10,}/g, 'org-***')
    .replace(/sk-[a-zA-Z0-9]{10,}/g, 'sk-***')
    .replace(/key-[a-zA-Z0-9]{10,}/g, 'key-***')
    .replace(/https?:\/\/[^\s"']+/g, '[url-redacted]');
}

/**
 * Extract a Google/Antigravity account-verification URL from a 403 error body.
 * Google Cloud Code APIs return structured error details when the user must
 * verify their account before continuing.
 *
 * Looks for:
 *  - metadata.validation_url in ErrorInfo details
 *  - Help.links[].url with description "Verify your account"
 *  - Deep-linked fallback from error.message containing validation_url
 */
export function extractGoogleValidationUrl(bodyText: string): string | null {
  if (!bodyText || typeof bodyText !== 'string') return null;
  try {
    const json = JSON.parse(bodyText);
    const errorObj = json?.error;
    if (!errorObj) return null;

    // 1. Check structured details array for ErrorInfo metadata
    if (Array.isArray(errorObj.details)) {
      for (const detail of errorObj.details) {
        // ErrorInfo with metadata.validation_url
        if (detail?.metadata?.validation_url) {
          return detail.metadata.validation_url;
        }
        // Help.links with Verify your account
        if (detail?.['@type']?.includes('google.rpc.Help') && Array.isArray(detail.links)) {
          for (const link of detail.links) {
            if (link?.url && /verify/i.test(link.description || '')) {
              return link.url;
            }
          }
          // Fall back to first link
          if (detail.links.length > 0 && detail.links[0]?.url) {
            return detail.links[0].url;
          }
        }
      }
    }

    // 2. Check if message itself contains a validation URL pattern
    const message = String(errorObj.message || '');
    const urlMatch = message.match(/https?:\/\/accounts\.google\.com\/[^\s"']+/);
    if (urlMatch) return urlMatch[0];
  } catch {
    // Not valid JSON — try raw text extraction
    const urlMatch = bodyText.match(/"validation_url"\s*:\s*"(https?:\/\/[^"']+)"/);
    if (urlMatch) return urlMatch[1];

    const verifyMatch = bodyText.match(/https?:\/\/accounts\.google\.com\/[^\s"']+/);
    if (verifyMatch) return verifyMatch[0];
  }
  return null;
}

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
      message: sanitizeErrorMessage(message || DEFAULT_ERROR_MESSAGES[statusCode] || "An error occurred"),
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
        return { statusCode: parsed.status || response.status, message: msg, resetsAtMs: parsed.resetsAtMs };
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

  // Extract Google/Antigravity verification URL BEFORE message sanitization (URLs get redacted)
  const validationUrl = response.status === 403 ? extractGoogleValidationUrl(bodyText) : null;

  const messageStr = typeof message === "string" ? message : JSON.stringify(message);
  const finalMessage = sanitizeErrorMessage(messageStr || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`);

  return { statusCode: response.status, message: finalMessage, ...(validationUrl ? { validationUrl } : {}) };
}

/**
 * Create error result for chatCore handler
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {number} [resetsAtMs] - Optional precise cooldown expiry (ms epoch) for provider-specific quota errors
 * @returns {{ success: false, status: number, error: string, response: Response, resetsAtMs?: number }}
 */
export function createErrorResult(statusCode, message, resetsAtMs, metadata = null) {
  return {
    success: false,
    status: statusCode,
    error: message,
    resetsAtMs,
    ...(metadata && typeof metadata === "object" ? metadata : {}),
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
export function unavailableResponse(statusCode, message, retryAfter, retryAfterHuman) {
  const retryAfterSec = Math.max(Math.ceil((new Date(retryAfter).getTime() - Date.now()) / 1000), 1);
  const msg = sanitizeErrorMessage(`${message} (${retryAfterHuman})`);
  return new Response(
    JSON.stringify({ error: { message: msg } }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec)
      }
    }
  );
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
  const message = error.message || "Unknown error";
  // Expose low-level cause (e.g. UND_ERR_SOCKET, ECONNRESET, ETIMEDOUT) for diagnosing fetch failures
  const causeCode = error.cause?.code;
  const causeMsg = error.cause?.message;
  const causeStr = causeCode || causeMsg ? ` (cause: ${[causeCode, causeMsg].filter(Boolean).join(": ")})` : "";
  return `[${code}]: ${message}${causeStr}`;
}

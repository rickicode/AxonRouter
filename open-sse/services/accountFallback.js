import { ERROR_RULES, BACKOFF_CONFIG, TRANSIENT_COOLDOWN_MS } from "../config/errorConfig.js";

/**
 * Calculate exponential backoff cooldown for rate limits (429)
 * Level 1: 1s, Level 2: 2s, Level 3: 4s... → max 4 min
 * @param {number} backoffLevel - Current backoff level
 * @returns {number} Cooldown in milliseconds
 */
export function getQuotaCooldown(backoffLevel = 0) {
  const level = Math.max(0, backoffLevel - 1);
  const cooldown = BACKOFF_CONFIG.base * Math.pow(2, level);
  return Math.min(cooldown, BACKOFF_CONFIG.max);
}

/**
 * Check if error should trigger account fallback (switch to next account)
 * Config-driven: matches ERROR_RULES top-to-bottom (text rules first, then status)
 * @param {number} status - HTTP status code
 * @param {string} errorText - Error message text
 * @param {number} backoffLevel - Current backoff level
 * @returns {{ shouldFallback: boolean, cooldownMs: number, newBackoffLevel?: number, lockAll?: boolean }}
 */
export function checkFallbackError(status, errorText, backoffLevel = 0) {
  const lowerError = errorText
    ? (typeof errorText === "string" ? errorText : JSON.stringify(errorText)).toLowerCase()
    : "";

  // 524 / Gateway Timeout is transient upstream/server downtime — never lock or error the account
  if (status === 524 || lowerError.includes("524") || lowerError.includes("gateway timeout") || lowerError.includes("a timeout occurred")) {
    return { shouldFallback: true, cooldownMs: 0, lockAll: false, disableAccount: false };
  }
  // 499 / Client Disconnected / AbortError — client aborted request, never lock account or model, never fallback
  if (status === 499 || lowerError.includes("request aborted") || lowerError.includes("client disconnected") || lowerError.includes("client closed request")) {
    return { shouldFallback: false, cooldownMs: 0, lockAll: false, disableAccount: false };
  }

  for (const rule of ERROR_RULES) {
    // Text-based rule: match substring in error message
    if (rule.text && lowerError && lowerError.includes(rule.text)) {
      if (rule.backoff) {
        const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
        return { shouldFallback: true, cooldownMs: getQuotaCooldown(newLevel), newBackoffLevel: newLevel, lockAll: !!rule.lockAll, disableAccount: !!rule.disableAccount, isExhausted: !!rule.isExhausted };
      }
      const canFallback = rule.shouldFallback !== false;
      return { shouldFallback: canFallback, cooldownMs: rule.cooldownMs || 0, lockAll: !!rule.lockAll, disableAccount: !!rule.disableAccount, isExhausted: !!rule.isExhausted, isToolIncompatibility: !!rule.isToolIncompatibility };
    }

    // Status-based rule: match HTTP status code
    if (rule.status && rule.status === status) {
      if (rule.backoff) {
        const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
        return { shouldFallback: true, cooldownMs: getQuotaCooldown(newLevel), newBackoffLevel: newLevel, lockAll: !!rule.lockAll, disableAccount: !!rule.disableAccount, isExhausted: !!rule.isExhausted };
      }
      const canFallback = rule.shouldFallback !== false;
      return { shouldFallback: canFallback, cooldownMs: rule.cooldownMs || 0, lockAll: !!rule.lockAll, disableAccount: !!rule.disableAccount, isExhausted: !!rule.isExhausted, isToolIncompatibility: !!rule.isToolIncompatibility };
    }
  }

  // 5xx and unknown errors are transient (server error, network, etc):
  // lock briefly so we retry, but DO NOT treat as request-level (400/404/413)
  // which are handled by explicit rules above.
  if (status >= 500) {
    return { shouldFallback: true, cooldownMs: TRANSIENT_COOLDOWN_MS, disableAccount: false };
  }

  // 404 indicates the route or resource does not exist upstream (not transient
  // downtime). Treat it like other request-scoped 4xx so the account is not
  // penalised, but still hand it back for the caller.
  if (status === 404) {
    return { shouldFallback: false, cooldownMs: 0, lockAll: false, disableAccount: false };
  }

  // Default: do NOT lock for any other unmatched status (e.g. 400/413 from
  // custom providers). The account is fine; the request was bad.
  return { shouldFallback: false, cooldownMs: 0, lockAll: false, disableAccount: false };
}

/**
 * Detect permanent/fatal authentication failure that requires re-auth.
 * Such accounts must be disabled (isActive: false, testStatus: "disabled").
 */
export function isFatalAuthError(status, errorText) {
  if (status === 401) return true;
  const str = typeof errorText === "string" ? errorText : (errorText ? JSON.stringify(errorText) : "");
  if (!str) return false;
  return /\b(invalid_grant|invalid_api_key|invalid api key|invalid token|token revoked|revoked|unauthenticated|unauthorized|unrecoverable_refresh_error|refresh_token_reused|account has been banned|account has been deleted|user has been suspended|account suspended|banned|suspended|validation_required)\b/i.test(str)
    || /invalid authentication credential|verify.*account|verification required/i.test(str);
}

/**
 * Check if account is currently unavailable (cooldown not expired)
 */
export function isAccountUnavailable(unavailableUntil) {
  if (!unavailableUntil) return false;
  return new Date(unavailableUntil).getTime() > Date.now();
}

/**
 * Calculate unavailable until timestamp
 */
export function getUnavailableUntil(cooldownMs) {
  return new Date(Date.now() + cooldownMs).toISOString();
}

/**
 * Get the earliest rateLimitedUntil from a list of accounts
 * @param {Array} accounts - Array of account objects with rateLimitedUntil
 * @returns {string|null} Earliest rateLimitedUntil ISO string, or null
 */
export function getEarliestRateLimitedUntil(accounts) {
  let earliest = null;
  const now = Date.now();
  for (const acc of accounts) {
    if (!acc.rateLimitedUntil) continue;
    const until = new Date(acc.rateLimitedUntil).getTime();
    if (until <= now) continue;
    if (!earliest || until < earliest) earliest = until;
  }
  if (!earliest) return null;
  return new Date(earliest).toISOString();
}

/**
 * Format rateLimitedUntil to human-readable "reset after Xm Ys"
 * @param {string} rateLimitedUntil - ISO timestamp
 * @returns {string} e.g. "reset after 2m 30s"
 */
export function formatRetryAfter(rateLimitedUntil) {
  if (!rateLimitedUntil) return "";
  const diffMs = new Date(rateLimitedUntil).getTime() - Date.now();
  if (diffMs <= 0) return "reset after 0s";
  const totalSec = Math.ceil(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return `reset after ${parts.join(" ")}`;
}

/** Prefix for model lock flat fields on connection record */
export const MODEL_LOCK_PREFIX = "modelLock_";

/** Special key used when no model is known (account-level lock) */
export const MODEL_LOCK_ALL = `${MODEL_LOCK_PREFIX}__all`;

/** Build the flat field key for a model lock */
export function getModelLockKey(model) {
  return model ? `${MODEL_LOCK_PREFIX}${model}` : MODEL_LOCK_ALL;
}

/**
 * Normalized refreshBlocked check. Background writes the raw error string
 * (e.g. "invalid_grant"), request paths write true — every consumer must
 * treat any meaningful truthy marker as blocked, except explicit false-ish
 * strings left by cleanup code.
 */
export function isRefreshBlockedMarker(v) {
  if (v === true) return true;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s !== "" && s !== "false" && s !== "0" && s !== "null" && s !== "undefined";
}

export function isModelLockActive(connection, model) {
  if (!connection) return false;
  // Permanent lock for suspended, deleted, banned, or unrecoverable accounts
  if (connection.providerSpecificData?.refreshBlocked) {
    return true;
  }
  if (connection.isActive === false || connection.testStatus === "disabled") {
    return true;
  }
  const fatalPattern = /\b(account has been banned|account has been deleted|suspended|account suspended|token revoked|invalid_grant|invalid api key)\b/i;
  if (connection.lastError && fatalPattern.test(connection.lastError)) {
    return true;
  }
  const key = getModelLockKey(model);
  const expiries = [connection[key], connection.modelLocks?.[model], connection.modelLock___all, connection.modelLocks?.__all, connection.lockedAllUntil, connection.rateLimitedUntil]
    .map((value) => (value ? new Date(value).getTime() : 0))
    .filter((value) => Number.isFinite(value));
  return expiries.some((expiry) => expiry > Date.now());
}

/**
 * Get earliest active model lock expiry across all modelLock_* fields.
 * Used for UI cooldown display.
 */
export function getEarliestModelLockUntil(connection, model = null) {
  if (!connection) return null;
  let earliest = null;
  const now = Date.now();
  const candidates = model
    ? [
        connection[`modelLock_${model}`],
        connection.modelLocks?.[model],
        connection.modelLock___all,
        connection.modelLocks?.__all,
        connection.lockedAllUntil,
        connection.rateLimitedUntil,
      ].filter(Boolean)
    : [];
  if (!model) {
    for (const [key, val] of Object.entries(connection)) {
      if (key.startsWith(MODEL_LOCK_PREFIX) && val) candidates.push(val);
    }
    for (const val of Object.values(connection.modelLocks || {})) {
      if (val) candidates.push(val);
    }
    if (connection.lockedAllUntil) candidates.push(connection.lockedAllUntil);
    if (connection.rateLimitedUntil) candidates.push(connection.rateLimitedUntil);
  }

  for (const val of candidates) {
    const t = new Date(val).getTime();
    if (Number.isFinite(t) && t > now) {
      if (!earliest || t < earliest) earliest = t;
    }
  }
  return earliest ? new Date(earliest).toISOString() : null;
}

/**
 * Build update object to set a model lock on a connection.
 */
export function buildModelLockUpdate(model, cooldownMs) {
  const key = getModelLockKey(model);
  return { [key]: new Date(Date.now() + cooldownMs).toISOString() };
}

/**
 * Build update object to clear all model locks on a connection.
 */
export function buildClearModelLocksUpdate(connection) {
  const cleared = {};
  for (const key of Object.keys(connection)) {
    if (key.startsWith(MODEL_LOCK_PREFIX)) cleared[key] = null;
  }
  return cleared;
}

/**
 * Filter available accounts (not in cooldown)
 */
export function filterAvailableAccounts(accounts, excludeId = null) {
  const now = Date.now();
  return accounts.filter(acc => {
    if (excludeId && acc.id === excludeId) return false;
    if (acc.rateLimitedUntil) {
      const until = new Date(acc.rateLimitedUntil).getTime();
      if (until > now) return false;
    }
    return true;
  });
}

/**
 * Reset account state when request succeeds
 * Clears cooldown and resets backoff level to 0
 */
export function clearAccountError(account) {
  return {
    ...account,
    rateLimitedUntil: null,
    backoffLevel: 0,
    lastError: null,
    status: "active"
  };
}

/**
 * Update account error state on failure
 * Calculates exponential backoff and sets rateLimitedUntil
 */
export function setAccountError(account, status, errorText) {
  const backoffLevel = account.backoffLevel || 0;
  const { cooldownMs, newBackoffLevel } = checkFallbackError(status, errorText, backoffLevel);

  return {
    ...account,
    rateLimitedUntil: cooldownMs > 0 ? getUnavailableUntil(cooldownMs) : null,
    backoffLevel: newBackoffLevel ?? backoffLevel,
    lastError: { status, message: errorText, timestamp: new Date().toISOString() },
    status: "error"
  };
}

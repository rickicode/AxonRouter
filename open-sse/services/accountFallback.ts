import {
	ERROR_RULES,
	BACKOFF_CONFIG,
	TRANSIENT_COOLDOWN_MS,
	MAX_RATE_LIMIT_COOLDOWN_MS,
} from "../config/errorConfig";
import {
	getUseUpstreamRetryHints,
	getProviderProfile as getProviderProfileFromSettings,
} from "../utils/abort";

/**
 * Parse Retry-After or X-RateLimit-Reset headers to get precision cooldown.
 * @param headers - Response headers (Headers object or plain Record<string, string>)
 * @returns cooldownMs - milliseconds until reset, or null if no parseable header
 */
export function parseRetryAfterHeader(headers: any): number | null {
	if (!headers) return null;

	const getHeader = (name: string): string | null => {
		if (typeof headers.get === "function") return headers.get(name);
		if (typeof headers === "object") {
			return headers[name] ?? headers[name.toLowerCase()] ?? null;
		}
		return null;
	};

	// Check Retry-After header
	const retryAfter = getHeader("retry-after") ?? getHeader("Retry-After");
	if (retryAfter) {
		const trimmed = retryAfter.trim();
		// If pure integer, treat as seconds
		if (/^\d+$/.test(trimmed)) {
			const seconds = parseInt(trimmed, 10);
			const ms = seconds * 1000;
			return ms > 0 ? ms : null;
		}
		// Otherwise try to parse as HTTP-date
		const date = new Date(trimmed);
		const timestamp = date.getTime();
		if (Number.isFinite(timestamp)) {
			const remaining = timestamp - Date.now();
			return remaining > 0 ? remaining : null;
		}
	}

	// Check X-RateLimit-Reset header
	const rateLimitReset = getHeader("x-ratelimit-reset") ?? getHeader("X-RateLimit-Reset");
	if (rateLimitReset) {
		const trimmed = rateLimitReset.trim();
		const numValue = Number(trimmed);
		if (Number.isFinite(numValue) && numValue > 0) {
			let resetTimestampMs: number;
			// If > 10000000000, treat as milliseconds timestamp
			if (numValue > 10000000000) {
				resetTimestampMs = numValue;
			} else {
				// Otherwise treat as seconds timestamp
				resetTimestampMs = numValue * 1000;
			}
			const remaining = resetTimestampMs - Date.now();
			return remaining > 0 ? remaining : null;
		}
	}

	return null;
}

/**
 * Resolve provider profile with defaults.
 * Merges settings-stored profile with hardcoded defaults.
 */
export function resolveProviderProfile(providerId?: string) {
	const profile = providerId ? getProviderProfileFromSettings(providerId) : null;
	return {
		baseCooldownMs: profile?.baseCooldownMs ?? BACKOFF_CONFIG.base,
		maxBackoffSteps: profile?.maxBackoffSteps ?? BACKOFF_CONFIG.maxLevel,
		useUpstreamRetryHints: profile?.useUpstreamRetryHints ?? getUseUpstreamRetryHints(),
	};
}

/**
 * Calculate exponential backoff cooldown for rate limits (429)
 * Level 1: 1s, Level 2: 2s, Level 3: 4s... → max 4 min
 * @param {number} backoffLevel - Current backoff level
 * @param {number} base - Base cooldown in milliseconds (default: BACKOFF_CONFIG.base)
 * @returns {number} Cooldown in milliseconds
 */
export function getQuotaCooldown(backoffLevel = 0, base = BACKOFF_CONFIG.base) {
	const level = Math.max(0, backoffLevel - 1);
	const cooldown = base * 2 ** level;
	return Math.min(cooldown, BACKOFF_CONFIG.max);
}

/**
 * Check if error should trigger account fallback (switch to next account)
 * Config-driven: matches ERROR_RULES top-to-bottom (text rules first, then status)
 * @param {number} status - HTTP status code
 * @param {string} errorText - Error message text
 * @param {number} backoffLevel - Current backoff level for exponential backoff
 * @param {object} options - Optional: { headers, providerId }
 * @returns {{ shouldFallback: boolean, cooldownMs: number, newBackoffLevel?: number }}
 */
export function checkFallbackError(status, errorText, backoffLevel = 0, options?: { headers?: any; providerId?: string }) {
	const lowerError = errorText
		? (typeof errorText === "string"
				? errorText
				: JSON.stringify(errorText)
			).toLowerCase()
		: "";

	const isRequestValidationError =
		status === 400 &&
		(lowerError.includes("improperly formed request") ||
			lowerError.includes("invalid model") ||
			lowerError.includes("model not available") ||
			lowerError.includes("requested model is not available") ||
			lowerError.includes("model_not_supported") ||
			lowerError.includes("unsupported model") ||
			lowerError.includes("not available for integrator") ||
			lowerError.includes("vscode-chat") ||
			lowerError.includes("bad request"));

	if (isRequestValidationError) {
		return { shouldFallback: false, cooldownMs: 0 };
	}

	for (const rule of ERROR_RULES) {
		// Text-based rule: match substring in error message
		if (rule.text && lowerError && lowerError.includes(rule.text)) {
			if (rule.backoff) {
				const profile = resolveProviderProfile(options?.providerId);
				const newLevel = Math.min(backoffLevel + 1, profile.maxBackoffSteps);

				// Try upstream retry hint if enabled
				if (options?.headers && profile.useUpstreamRetryHints) {
					const parsedCooldown = parseRetryAfterHeader(options.headers);
					if (parsedCooldown != null && parsedCooldown > 0) {
						const cappedCooldown = Math.min(parsedCooldown, MAX_RATE_LIMIT_COOLDOWN_MS);
						return {
							shouldFallback: true,
							cooldownMs: cappedCooldown,
							newBackoffLevel: newLevel,
						};
					}
				}

				return {
					shouldFallback: true,
					cooldownMs: getQuotaCooldown(newLevel, profile.baseCooldownMs),
					newBackoffLevel: newLevel,
				};
			}
			return { shouldFallback: true, cooldownMs: rule.cooldownMs };
		}

		// Status-based rule: match HTTP status code
		if (rule.status && rule.status === status) {
			if (rule.backoff) {
				const profile = resolveProviderProfile(options?.providerId);
				const newLevel = Math.min(backoffLevel + 1, profile.maxBackoffSteps);

				// Try upstream retry hint if enabled
				if (options?.headers && profile.useUpstreamRetryHints) {
					const parsedCooldown = parseRetryAfterHeader(options.headers);
					if (parsedCooldown != null && parsedCooldown > 0) {
						const cappedCooldown = Math.min(parsedCooldown, MAX_RATE_LIMIT_COOLDOWN_MS);
						return {
							shouldFallback: true,
							cooldownMs: cappedCooldown,
							newBackoffLevel: newLevel,
						};
					}
				}

				return {
					shouldFallback: true,
					cooldownMs: getQuotaCooldown(newLevel, profile.baseCooldownMs),
					newBackoffLevel: newLevel,
				};
			}
			return { shouldFallback: true, cooldownMs: rule.cooldownMs };
		}
	}

	// Default: transient cooldown for any unmatched error
	return { shouldFallback: true, cooldownMs: TRANSIENT_COOLDOWN_MS };
}

function hasFutureTimestamp(value) {
	if (!value) return false;
	const timestamp = new Date(value).getTime();
	return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function getCanonicalUnavailableUntil(account: any = {}) {
	if (!account || typeof account !== "object") return null;

	const nextRetryAt = hasFutureTimestamp(account.nextRetryAt)
		? account.nextRetryAt
		: null;
	const resetAt = hasFutureTimestamp(account.resetAt) ? account.resetAt : null;

	if (nextRetryAt && resetAt) {
		return new Date(nextRetryAt).getTime() <= new Date(resetAt).getTime()
			? nextRetryAt
			: resetAt;
	}

	return nextRetryAt || resetAt || null;
}

export function isCanonicalUnavailable(account: any = {}) {
	if (!account || typeof account !== "object") return false;

	const routingStatus = account.routingStatus || null;
	if (routingStatus && routingStatus !== "eligible") return true;

	const authState = account.authState || null;
	if (["invalid", "revoked"].includes(authState)) return true;

	const healthStatus = account.healthStatus || null;
	if (["error", "failed", "unhealthy", "down"].includes(healthStatus))
		return true;

	const quotaState = account.quotaState || null;
	if (["exhausted", "cooldown", "blocked"].includes(quotaState)) return true;

	// Time-based cooldown is canonical for rate limits even when routingStatus stays eligible.

	return Boolean(getCanonicalUnavailableUntil(account));
}

/**
 * Check if account is currently unavailable.
 * Accepts either a legacy timestamp string (local compatibility) or a canonical account object.
 */
export function isAccountUnavailable(accountOrUntil) {
	if (!accountOrUntil) return false;

	if (typeof accountOrUntil === "string") {
		return hasFutureTimestamp(accountOrUntil);
	}

	return isCanonicalUnavailable(accountOrUntil);
}

/**
 * Calculate unavailable until timestamp
 */
export function getUnavailableUntil(cooldownMs) {
	return new Date(Date.now() + cooldownMs).toISOString();
}

/**
 * Get earliest canonical retry timestamp from a list of accounts.
 * Falls back to legacy rateLimitedUntil only for local payload compatibility.
 */
export function getEarliestRateLimitedUntil(accounts) {
	let earliest = null;
	const now = Date.now();
	for (const acc of accounts) {
		const typedAcc: any = acc;
		const untilValue =
			getCanonicalUnavailableUntil(typedAcc) ||
			typedAcc?.rateLimitedUntil ||
			null;
		if (!untilValue) continue;
		const until = new Date(untilValue).getTime();
		if (!Number.isFinite(until) || until <= now) continue;
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
 * Check if a model lock on a connection is still active.
 * Reads flat field `modelLock_${model}` (or `modelLock___all` when model=null).
 */
export function isModelLockActive(connection, model) {
	const key = getModelLockKey(model);
	const expiry = connection[key] || connection[MODEL_LOCK_ALL];
	if (!expiry) return false;
	return new Date(expiry).getTime() > Date.now();
}

/**
 * Get earliest active model lock expiry across all modelLock_* fields.
 * Used for UI cooldown display.
 */
export function getEarliestModelLockUntil(connection) {
	if (!connection) return null;
	let earliest = null;
	const now = Date.now();
	for (const [key, val] of Object.entries(connection)) {
		if (!key.startsWith(MODEL_LOCK_PREFIX) || !val) continue;
		const t = new Date(val as any).getTime();
		if (t <= now) continue;
		if (!earliest || t < earliest) earliest = t;
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
	return accounts.filter((acc) => {
		if (excludeId && acc.id === excludeId) return false;
		if (isAccountUnavailable(acc)) return false;
		return true;
	});
}

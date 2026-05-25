const AUTH_BLOCKED_PATTERNS = [
  "token invalid",
  "invalid token",
  "token expired",
  "refresh failed",
  "re-authorize",
  "reauthorize",
  "sign in again",
  "unauthorized",
  "unauthenticated",
  "revoked",
  "invalid grant",
  "invalid_client",
  "invalid_token",
  "oauth",
  "access token",
  "authentication",
];

export function getConnectionRecoveryPatch({
  lastCheckedAt = new Date().toISOString(),
  usageSnapshot = undefined,
}: any = {}) {
  return {
    routingStatus: "eligible",
    healthStatus: "healthy",
    quotaState: "ok",
    authState: "ok",
    reasonCode: null,
    reasonDetail: null,
    nextRetryAt: null,
    resetAt: null,
    backoffLevel: 0,
    lastCheckedAt,
    ...(usageSnapshot !== undefined ? { usageSnapshot } : {}),
  };
}

export function getLiveRequestRecoveryPatch({
  lastCheckedAt = new Date().toISOString(),
  usageSnapshot = undefined,
}: any = {}) {
  return {
    ...getConnectionRecoveryPatch({ lastCheckedAt, usageSnapshot }),
    allowAuthRecovery: true,
  };
}

export function isConfirmedAuthBlockedError(error: any, { statusCode = null }: any = {}) {
  if (statusCode === 401) {
    return true;
  }

  const message = typeof error === "string"
    ? error
    : error?.message || error?.error || error?.cause?.message || "";

  if (!message) {
    return false;
  }

  const normalized = String(message).toLowerCase();
  const hasAuthEvidence = AUTH_BLOCKED_PATTERNS.some((pattern) => normalized.includes(pattern));

  if (statusCode === 403) {
    return hasAuthEvidence;
  }

  return hasAuthEvidence;
}

export function getConnectionAuthBlockedPatch(
  error: any,
  { lastCheckedAt = new Date().toISOString(), statusCode = null, usageSnapshot = undefined }: any = {},
) {
  const message = typeof error === "string"
    ? error
    : error?.message || error?.error || error?.cause?.message || "";

  if (!isConfirmedAuthBlockedError(message, { statusCode })) {
    return null;
  }

  const reasonDetail = message || "Provider error";
  const normalizedReason = reasonDetail.toLowerCase();
  const requiresReauthorization = normalizedReason.includes("re-authorize")
    || normalizedReason.includes("reauthorize")
    || normalizedReason.includes("invalid grant")
    || normalizedReason.includes("revoked");

  return {
    routingStatus: requiresReauthorization ? "disabled" : "blocked",
    healthStatus: "healthy",
    quotaState: "ok",
    authState: "invalid",
    reasonCode: requiresReauthorization ? "reauthorization_required" : "auth_invalid",
    reasonDetail,
    nextRetryAt: null,
    resetAt: null,
    lastCheckedAt,
    ...(usageSnapshot !== undefined ? { usageSnapshot } : {}),
  };
}

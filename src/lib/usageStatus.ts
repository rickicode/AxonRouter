import { getCurrentProviderConnectionById } from "./connectionStateAccess";
import { updateCurrentProviderConnection } from "./connectionStateWriteAccess";
import { getConnectionHotState } from "./providerHotState";
import {
  getConnectionAuthBlockedPatch,
  getConnectionRecoveryPatch,
  getLiveRequestRecoveryPatch,
  isConfirmedAuthBlockedError,
} from "./usageStatusPatches";
import {
  buildCodexSyntheticSnapshot,
  ensureUsageSnapshot,
} from "./usageStatusSnapshots";
import { persistConnectionHotStateSnapshot } from "./connectionHotStateStore";
import { AUTH_BLOCKED_PATTERNS } from "./usageStatusPatches";

const AUTH_EXPIRED_PATTERNS = ["token expired", "access token expired", "session expired", "authentication expired", "auth expired", "unauthorized", "401", "re-authorize"];
const CODEX_LIVE_QUOTA_PATTERNS = [
  "exceeded your current quota",
  "quota exceeded",
  "quota exhausted",
  "insufficient quota",
  "billing hard limit",
  "hard limit reached",
  "usage_limit_reached",
  "usage limit reached",
  "usage limit has been reached",
  "weekly quota exhausted",
];
const UPSTREAM_PROCESSING_ERROR_PATTERNS = [
  "error occurred",
  "request id",
  "internal error",
];

const TRANSIENT_UPSTREAM_TIMEOUT_PATTERNS = [
  "upstream timed out after",
  "stream idle timed out after",
  "etimedout",
  "econnaborted",
];

export function isAuthExpiredMessage(usage) {
  if (!usage?.message) return false;
  const msg = usage.message.toLowerCase();
  return AUTH_EXPIRED_PATTERNS.some((p) => msg.includes(p));
}

const LEGACY_MIRROR_FIELDS = new Set([
  "testStatus",
  "lastTested",
  "lastErrorType",
  "lastErrorAt",
  "rateLimitedUntil",
  "errorCode",
  "lastError",
]);

function stripLegacyMirrorFields(updates: any = {}) {
  if (!updates || typeof updates !== "object") return {};

  const sanitized = { ...updates };
  for (const key of LEGACY_MIRROR_FIELDS) {
    delete sanitized[key];
  }

  return sanitized;
}


export async function syncUsageStatus(connection: any, updates: any) {
  if (!connection?.id || !updates || typeof updates !== "object") {
    return;
  }

  // Prevent stale updates from overwriting fresh data.
  // Read from hot_state (the actual source of truth for lastCheckedAt)
  // rather than the entities table, which is not updated by usage refreshes.
  const hotState: any = connection?.provider
    ? await getConnectionHotState(connection.id, connection.provider)
    : null;
  const currentLastCheckedAt = hotState?.lastCheckedAt || connection?.lastCheckedAt;
  if (currentLastCheckedAt && updates?.lastCheckedAt) {
    const currentCheckedAt = new Date(currentLastCheckedAt).getTime();
    const newCheckedAt = new Date(updates.lastCheckedAt).getTime();

    if (currentCheckedAt > newCheckedAt) {
      console.warn(`[UsageStatus] Ignoring stale update for ${connection.id}: current=${currentLastCheckedAt}, new=${updates.lastCheckedAt}`);
      // Stale update — return minimal status acknowledging the check occurred
      // without overwriting the fresher hot_state data.
      return {
        lastCheckedAt: currentLastCheckedAt,
        usageSnapshot: connection?.usageSnapshot || null,
      };
    }
  }

  const sanitizedUpdates: any = stripLegacyMirrorFields(updates);

  // Cap nextRetryAt and resetAt to max 7 days from now to prevent infinitely-future
  // timestamps from scheduling bugs, misconfigured provider resetAt, or clock skew.
  const MAX_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;
  const maxAllowed = Date.now() + MAX_HORIZON_MS;
  for (const tsField of ["nextRetryAt", "resetAt"] as const) {
    const val = sanitizedUpdates[tsField];
    if (val) {
      const time = new Date(val).getTime();
      if (Number.isFinite(time) && time > maxAllowed) {
        sanitizedUpdates[tsField] = new Date(maxAllowed).toISOString();
      }
    }
  }
  const allowAuthRecovery = sanitizedUpdates.allowAuthRecovery === true;
  if ("allowAuthRecovery" in sanitizedUpdates) {
    delete sanitizedUpdates.allowAuthRecovery;
  }
  const isRecoveryToEligible = sanitizedUpdates.routingStatus === "eligible"
    && sanitizedUpdates.authState === "ok";
  const hasAuthInvalidBlock = connection?.reasonCode === "auth_invalid"
    || connection?.authState === "invalid"
    || connection?.routingStatus === "blocked";

  if (isRecoveryToEligible && hasAuthInvalidBlock && !allowAuthRecovery) {
    // Preserve auth-blocked status but still persist non-recovery fields
    // (usageSnapshot, lastCheckedAt) so the UI reflects the latest check.
    const preservedPatch = {
      routingStatus: connection?.routingStatus,
      authState: connection?.authState,
      reasonCode: connection?.reasonCode,
      reasonDetail: connection?.reasonDetail,
      nextRetryAt: connection?.nextRetryAt ?? sanitizedUpdates.nextRetryAt ?? null,
      resetAt: connection?.resetAt ?? sanitizedUpdates.resetAt ?? null,
      lastCheckedAt: sanitizedUpdates.lastCheckedAt || connection?.lastCheckedAt,
      usageSnapshot: sanitizedUpdates.usageSnapshot || connection?.usageSnapshot,
      validationUrl: connection?.validationUrl ?? null,
    };

    const lastCheckedAt = preservedPatch.lastCheckedAt || new Date().toISOString();
    const hotPatch = {
      ...ensureUsageSnapshot(connection, preservedPatch, { checkedAt: lastCheckedAt }),
      lastCheckedAt,
      version: sanitizedUpdates.version || Date.now(),
    };
    const snapshot = await persistConnectionHotStateSnapshot(
      connection.provider,
      connection.id,
      hotPatch,
    );
    return stripLegacyMirrorFields(snapshot || hotPatch);
  }

  const lastCheckedAt = sanitizedUpdates.lastCheckedAt || updates.lastCheckedAt || updates.lastTested || new Date().toISOString();
  const hotPatch = {
    ...ensureUsageSnapshot(connection, sanitizedUpdates, { checkedAt: lastCheckedAt }),
    lastCheckedAt,
    version: sanitizedUpdates.version || updates.version || Date.now(),
  };
  const snapshot = await persistConnectionHotStateSnapshot(
    connection.provider,
    connection.id,
    hotPatch,
  );
  const merged = stripLegacyMirrorFields(snapshot || hotPatch);

  return merged;
}

function getHealthyUsageStatusUpdates(usage: any) {
  const lastCheckedAt = new Date().toISOString();
  return {
    routingStatus: "eligible",
    healthStatus: "healthy",
    quotaState: "ok",
    authState: "ok",
    reasonCode: null,
    reasonDetail: null,
    lastCheckedAt,
    usageSnapshot: JSON.stringify(usage || {}),
    resetAt: null,
    nextRetryAt: null,
  };
}

export {
  getConnectionRecoveryPatch,
  getLiveRequestRecoveryPatch,
  isConfirmedAuthBlockedError,
  getConnectionAuthBlockedPatch,
} from "./usageStatusPatches";

export function isUpstreamProcessingError(statusCode, errorMessage) {
  if (!Number.isFinite(Number(statusCode))) {
    return false;
  }

  const numericStatusCode = Number(statusCode);
  if (numericStatusCode < 500 || numericStatusCode > 599) {
    return false;
  }

  const message = typeof errorMessage === "string"
    ? errorMessage
    : errorMessage?.message || errorMessage?.error || errorMessage?.cause?.message || "";

  if (!message) {
    return false;
  }

  const normalized = String(message).toLowerCase();
  return UPSTREAM_PROCESSING_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function isTransientUpstreamTimeoutError(error: any, { statusCode = null, errorCode = null }: any = {}) {
  const message = typeof error === "string"
    ? error
    : error?.message || error?.error || error?.cause?.message || "";

  const normalizedMessage = String(message || "").toLowerCase();
  const normalizedErrorCode = String(errorCode || error?.code || "").toUpperCase();
  const numericStatusCode = Number.isFinite(Number(statusCode)) ? Number(statusCode) : null;

  if (normalizedErrorCode === "UPSTREAM_TIMEOUT" || normalizedErrorCode === "STREAM_IDLE_TIMEOUT") {
    return true;
  }

  if (numericStatusCode !== null && numericStatusCode !== 502 && numericStatusCode !== 504) {
    return false;
  }

  return TRANSIENT_UPSTREAM_TIMEOUT_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
}

export function getCodexLiveQuotaSignal(connection: any, { statusCode, errorText, errorCode }: { statusCode?: any; errorText?: any; errorCode?: any } = {}) {
  if (connection?.provider !== "codex") return null;
  if (statusCode !== 429) return null;

  let parsedErrorType = "";
  let parsedResetAt = null;
  if (typeof errorText === "string") {
    try {
      const parsed = JSON.parse(errorText);
      parsedErrorType = parsed?.error?.type || parsed?.type || parsed?.code || "";
      parsedResetAt = parsed?.error?.resets_at || parsed?.error?.reset_at || parsed?.resets_at || parsed?.reset_at || null;
    } catch {
      parsedErrorType = "";
    }
  }

  const normalized = [errorText, errorCode, parsedErrorType]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");

  if (!normalized || !CODEX_LIVE_QUOTA_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return null;
  }

  const numericReset = Number(parsedResetAt);
  const parsedResetTimestamp = Number.isFinite(numericReset)
    ? (numericReset < 1000000000000 ? numericReset * 1000 : numericReset)
    : parsedResetAt
      ? new Date(parsedResetAt).getTime()
      : null;

  return {
    provider: "codex",
    kind: "quota_exhausted",
    reasonCode: "quota_exhausted",
    reasonDetail: "Codex quota exhausted",
    errorCode: "codex_live_quota_exhausted",
    resetAt: Number.isFinite(parsedResetTimestamp) ? new Date(parsedResetTimestamp).toISOString() : null,
  };
}

/**
 * Antigravity model ID → family name mapping.
 * Each family has independent quota (e.g. Claude models vs Gemini models).
 */
const ANTIGRAVITY_MODEL_FAMILIES: Record<string, string> = {
  "claude-opus-4-6-thinking": "Claude",
  "claude-sonnet-4-6": "Claude",
  "gemini-3.1-pro-high": "Gemini",
  "gemini-3.1-pro-low": "Gemini",
  "gemini-3-flash": "Gemini",
  "gpt-oss-120b-medium": "Other",
};

function getAntigravityModelFamily(modelKey: string): string {
  // Exact match first
  if (ANTIGRAVITY_MODEL_FAMILIES[modelKey]) {
    return ANTIGRAVITY_MODEL_FAMILIES[modelKey];
  }
  // Prefix-based fallback
  if (modelKey.startsWith("claude-") || modelKey.startsWith("anthropic/claude-")) return "Claude";
  if (modelKey.startsWith("gemini-")) return "Gemini";
  if (modelKey.startsWith("gpt-")) return "Other";
  return "Other";
}

/**
 * Aggregate Antigravity quotas by model family and determine exhaustion state.
 */
export function getAntigravityFamilyQuotaState(usage: any = {}): {
  families: Array<{ name: string; models: number; exhausted: number; remainingPercentage: number | null; resetAt: string | null }>;
  allFamiliesExhausted: boolean;
  someFamilyExhausted: boolean;
} {
  const quotas = usage?.quotas;
  if (!quotas || typeof quotas !== "object") {
    return { families: [], allFamiliesExhausted: false, someFamilyExhausted: false };
  }

  // Group models by family
  const families = new Map<string, Array<{ modelKey: string; remainingPercentage: number; resetAt: string | null }>>();

  for (const [modelKey, rawQuota] of Object.entries(quotas)) {
    const quota = rawQuota as any;
    if (!quota || typeof quota !== "object") continue;

    const family = getAntigravityModelFamily(modelKey);
    if (!families.has(family)) families.set(family, []);

    const remainingPercentage =
      typeof quota.remainingPercentage === "number" && quota.remainingPercentage >= 0 && quota.remainingPercentage <= 100
        ? quota.remainingPercentage
        : 100;

    families.get(family)!.push({
      modelKey,
      remainingPercentage,
      resetAt: quota.resetAt || null,
    });
  }

  if (families.size === 0) {
    return { families: [], allFamiliesExhausted: false, someFamilyExhausted: false };
  }

  const familyResults: Array<{
    name: string;
    models: number;
    exhausted: number;
    remainingPercentage: number | null;
    resetAt: string | null;
  }> = [];

  let exhaustedFamilyCount = 0;
  const familyNames = ["Claude", "Gemini", "Other"];

  // Iterate in canonical order
  for (const familyName of familyNames) {
    const models = families.get(familyName);
    if (!models || models.length === 0) continue;

    const exhausted = models.filter((m) => m.remainingPercentage <= 0).length;
    const allExhausted = exhausted === models.length;

    // Find the earliest reset across all models in the family
    const resetAt = models.reduce<string | null>((earliest, m) => {
      if (!m.resetAt) return earliest;
      if (!earliest || m.resetAt < earliest) return m.resetAt;
      return earliest;
    }, null);

    // Best remaining percentage across the family (least exhausted model)
    const bestRemaining = allExhausted
      ? 0
      : Math.min(...models.filter((m) => m.remainingPercentage > 0).map((m) => m.remainingPercentage));

    if (allExhausted) exhaustedFamilyCount++;

    familyResults.push({
      name: familyName,
      models: models.length,
      exhausted,
      remainingPercentage: allExhausted ? 0 : bestRemaining,
      resetAt,
    });
  }

  // Also include any families not in the canonical list
  for (const [familyName, models] of families) {
    if (familyNames.includes(familyName)) continue;

    const exhausted = models.filter((m) => m.remainingPercentage <= 0).length;
    const allExhausted = exhausted === models.length;

    const resetAt = models.reduce<string | null>((earliest, m) => {
      if (!m.resetAt) return earliest;
      if (!earliest || m.resetAt < earliest) return m.resetAt;
      return earliest;
    }, null);

    const bestRemaining = allExhausted
      ? 0
      : Math.min(...models.filter((m) => m.remainingPercentage > 0).map((m) => m.remainingPercentage));

    if (allExhausted) exhaustedFamilyCount++;

    familyResults.push({
      name: familyName,
      models: models.length,
      exhausted,
      remainingPercentage: allExhausted ? 0 : bestRemaining,
      resetAt,
    });
  }

  return {
    families: familyResults,
    allFamiliesExhausted: familyResults.length > 0 && exhaustedFamilyCount === familyResults.length,
    someFamilyExhausted: exhaustedFamilyCount > 0,
  };
}

function getCodexExhaustedQuota(usage: any = {}) {
  const usageRecord = usage as any;
  const quotas = usageRecord?.quotas;
  if (!quotas || typeof quotas !== "object") return null;

  for (const [quotaName, quota] of Object.entries(quotas)) {
    if (!quota || typeof quota !== "object") continue;
    const quotaRecord = quota as any;

    const remaining = getFiniteNumber(quotaRecord.remaining);
    const used = getFiniteNumber(quotaRecord.used);
    const total = getFiniteNumber(quotaRecord.total);

    const hasExhaustedRemaining = remaining !== null && remaining <= 0;
    const hasExhaustedTotal = total !== null
      && total > 0
      && used !== null
      && used >= total;

    if (hasExhaustedRemaining || hasExhaustedTotal) {
      return {
        quotaName,
        resetAt: quotaRecord.resetAt || null,
      };
    }
  }

  return null;
}

function getConfiguredMinimumRemainingQuotaPercent(connection: any = {}, options: any = {}) {
  const explicitOptionThreshold = options?.globalExhaustedThreshold;
  if (explicitOptionThreshold !== undefined && explicitOptionThreshold !== null && explicitOptionThreshold !== "") {
    const parsed = Number(explicitOptionThreshold);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }

  const rawValue = connection?.providerSpecificData?.minimumRemainingQuotaPercent;
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return 10;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 10;

  return Math.max(0, Math.min(100, parsed));
}

function getFiniteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getSafeRemainingPercent(quota: any = {}) {
  if (!quota || typeof quota !== "object") return null;

  const explicitRemainingPercentage = getFiniteNumber(quota.remainingPercentage);
  if (explicitRemainingPercentage !== null && explicitRemainingPercentage >= 0 && explicitRemainingPercentage <= 100) {
    return explicitRemainingPercentage;
  }

  const total = getFiniteNumber(quota.total);
  const used = getFiniteNumber(quota.used);
  const remaining = getFiniteNumber(quota.remaining);

  if (total !== null && total > 0 && remaining !== null && remaining >= 0 && remaining <= total) {
    const remainingPercent = (remaining / total) * 100;
    return Number.isFinite(remainingPercent) && remainingPercent >= 0 && remainingPercent <= 100
      ? remainingPercent
      : null;
  }

  // Fallback: derive from used/total when remaining is unavailable
  if (total === null || total <= 0 || used === null || used < 0) return null;

  const remainingPercent = ((total - used) / total) * 100;
  return Number.isFinite(remainingPercent) && remainingPercent >= 0 && remainingPercent <= 100
    ? remainingPercent
    : null;
}

function shouldIgnoreKiroQuotaForRouting(quotaName: any) {
  const normalizedQuotaName = typeof quotaName === "string" ? quotaName.trim().toLowerCase() : "";
  return normalizedQuotaName.endsWith("_freetrial");
}

function getKiroQuotaSignal(connection: any, usage: any = {}, options: any = {}) {
  const quotas = usage?.quotas;
  if (!quotas || typeof quotas !== "object") {
    if (usage?.limitReached === true || usage?.revoked === true) {
      return {
        kind: "exhausted",
        quotaName: null,
        resetAt: null,
      };
    }
    return null;
  }

  const minimumRemainingQuotaPercent = getConfiguredMinimumRemainingQuotaPercent(connection, options);

  for (const [quotaName, quota] of Object.entries(quotas)) {
    if (shouldIgnoreKiroQuotaForRouting(quotaName)) continue;
    if (!quota || typeof quota !== "object") continue;
    const quotaRecord = quota as any;

    const total = quotaRecord.total;
    const used = quotaRecord.used;
    const remaining = quotaRecord.remaining;

    const hasExplicitExhaustion = typeof remaining === "number" && remaining <= 0;
    const hasUsedAllQuota = Number.isFinite(total)
      && total > 0
      && Number.isFinite(used)
      && used >= total;

    if (hasExplicitExhaustion || hasUsedAllQuota || usage?.limitReached === true || usage?.revoked === true) {
      return {
        kind: "exhausted",
        quotaName,
        resetAt: quotaRecord.resetAt || null,
      };
    }

    const remainingPercent = getSafeRemainingPercent(quota);
    if (remainingPercent === null) continue;

    if (remainingPercent <= minimumRemainingQuotaPercent) {
      return {
        kind: "threshold",
        quotaName,
        resetAt: quotaRecord.resetAt || null,
        remainingPercent,
        minimumRemainingQuotaPercent,
      };
    }
  }

  if (usage?.limitReached === true || usage?.revoked === true) {
    return {
      kind: "exhausted",
      quotaName: null,
      resetAt: null,
    };
  }

  return null;
}

export function getUsageStatusUpdates(connection: any, usage: any, options: any = {}) {
  const base = getHealthyUsageStatusUpdates(usage);
  const liveSignal = options.liveSignal || null;
  const nowIso = options.observedAt || new Date().toISOString();
  const usageMessage = typeof usage?.message === "string" ? usage.message : "";

  const codexUsageApiUnavailableMatch = connection?.provider === "codex"
    ? usageMessage.match(/^Codex connected\. Usage API temporarily unavailable \((\d{3})\)\.?$/)
    : null;

  if (codexUsageApiUnavailableMatch) {
    const isConnEligible = !connection?.routingStatus || connection.routingStatus === "eligible";
    if (isConnEligible) {
      return {
        ...base,
        usageSnapshot: JSON.stringify(usage || {}),
        lastCheckedAt: nowIso,
      };
    }
    // Non-eligible: preserve existing state, just update snapshot + timestamp
    return {
      usageSnapshot: JSON.stringify(usage || {}),
      lastCheckedAt: nowIso,
    };
  }

  const authBlockedPatch = getConnectionAuthBlockedPatch(usageMessage, {
    lastCheckedAt: nowIso,
    statusCode: connection?.provider === "codex" && /\((\d{3})\)/.test(usageMessage)
      ? Number(usageMessage.match(/\((\d{3})\)/)?.[1])
      : null,
  });

  if (authBlockedPatch) {
    return {
      ...base,
      ...authBlockedPatch,
      usageSnapshot: JSON.stringify(usage || {}),
    };
  }

  if (liveSignal?.kind === "quota_exhausted" && connection?.provider === "codex") {
    return {
      ...base,
      routingStatus: "exhausted",
      healthStatus: "degraded",
      quotaState: "exhausted",
      reasonCode: liveSignal.reasonCode || "quota_exhausted",
      reasonDetail: liveSignal.reasonDetail || "Codex quota exhausted",
      resetAt: liveSignal.resetAt || null,
      nextRetryAt: liveSignal.resetAt || null,
      usageSnapshot: JSON.stringify(buildCodexSyntheticSnapshot(connection, {
        message: liveSignal.reasonDetail || "Codex quota exhausted",
        resetAt: liveSignal.resetAt || null,
        nextRetryAt: liveSignal.resetAt || null,
      }, { checkedAt: nowIso })),
    };
  }

  if (connection?.provider === "kiro" || connection?.provider === "amazon-q") {
    const kiroQuotaSignal = getKiroQuotaSignal(connection, usage, options);

    if (kiroQuotaSignal?.kind === "exhausted") {
      return {
        ...base,
        routingStatus: "exhausted",
        healthStatus: "degraded",
        quotaState: "exhausted",
        reasonCode: "quota_exhausted",
        reasonDetail: connection?.provider === "amazon-q" ? "Amazon Q quota exhausted" : "Kiro quota exhausted",
        resetAt: kiroQuotaSignal.resetAt || null,
        nextRetryAt: kiroQuotaSignal.resetAt || null,
        usageSnapshot: JSON.stringify(usage || {}),
      };
    }

    if (kiroQuotaSignal?.kind === "threshold") {
      return {
        ...base,
        routingStatus: "exhausted",
        healthStatus: "degraded",
        quotaState: "exhausted",
        reasonCode: "quota_threshold",
        reasonDetail: `${connection?.provider === "amazon-q" ? "Amazon Q" : "Kiro"} remaining quota is at or below ${kiroQuotaSignal.minimumRemainingQuotaPercent}%`,
        resetAt: kiroQuotaSignal.resetAt || null,
        nextRetryAt: kiroQuotaSignal.resetAt || null,
        usageSnapshot: JSON.stringify(usage || {}),
      };
    }
  }

  // Antigravity: per-family quota exhaustion
  // Gemini and Claude quotas are independent — only mark globally exhausted if ALL families are exhausted.
  if (connection?.provider === "antigravity") {
    const familyResult = getAntigravityFamilyQuotaState(usage);

    // Enrich snapshot with family-level aggregated data for the UI
    const enrichedUsage = {
      ...(usage || {}),
      _familyQuotas: familyResult.families,
    };

    if (familyResult.allFamiliesExhausted) {
      return {
        ...base,
        routingStatus: "exhausted",
        healthStatus: "degraded",
        quotaState: "exhausted",
        reasonCode: "quota_exhausted",
        reasonDetail: "All models exhausted across all families",
        usageSnapshot: JSON.stringify(enrichedUsage),
      };
    }

    if (familyResult.someFamilyExhausted) {
      // Only some families exhausted — keep eligible at connection level.
      // Per-model 429s will set model locks via markAccountUnavailable.
      return {
        ...base,
        usageSnapshot: JSON.stringify(enrichedUsage),
        reasonDetail: familyResult.families
          .filter((f: any) => f.exhausted)
          .map((f: any) => `${f.name} exhausted`)
          .join("; "),
      };
    }

    return {
      ...base,
      usageSnapshot: JSON.stringify(enrichedUsage),
    };
  }

  // Codex-only: quota exhaustion and threshold checks
  if (connection?.provider !== "codex") {
    return base;
  }

  const exhaustedQuota = getCodexExhaustedQuota(usage);

  if (exhaustedQuota || usage?.limitReached === true) {
    const quotaLabel = exhaustedQuota?.quotaName === "session"
      ? "session"
      : exhaustedQuota?.quotaName === "weekly"
        ? "weekly"
        : "quota";
    const reasonDetail = quotaLabel === "quota"
      ? "Codex quota exhausted"
      : `Codex ${quotaLabel} quota exhausted`;
    return {
      ...base,
      routingStatus: "exhausted",
      healthStatus: "degraded",
      quotaState: "exhausted",
      reasonCode: "quota_exhausted",
      reasonDetail,
      resetAt: exhaustedQuota?.resetAt || null,
      nextRetryAt: exhaustedQuota?.resetAt || null,
      usageSnapshot: JSON.stringify(usage || {}),
    };
  }

  const usageRecord = usage as any;
  const thresholds = Object.entries(usageRecord?.quotas || {}).filter(([quotaName]) => !shouldIgnoreKiroQuotaForRouting(quotaName));
  const minimumRemainingQuotaPercent = getConfiguredMinimumRemainingQuotaPercent(connection, options);
  const thresholdQuota = thresholds.find(([, quota]) => {
    if (!quota || typeof quota !== "object") return false;
    const remainingPercent = getSafeRemainingPercent(quota);
    if (remainingPercent === null) return false;
    return remainingPercent <= minimumRemainingQuotaPercent;
  });

  if (thresholdQuota) {
    return {
      ...base,
      routingStatus: "exhausted",
      healthStatus: "degraded",
      quotaState: "exhausted",
      reasonCode: "quota_threshold",
      reasonDetail: `Remaining quota is at or below ${minimumRemainingQuotaPercent}%`,
      resetAt: (thresholdQuota[1] as any).resetAt || null,
      nextRetryAt: (thresholdQuota[1] as any).resetAt || null,
      usageSnapshot: JSON.stringify(usage || {}),
    };
  }

  return base;
}

export async function applyCanonicalUsageRefresh(connection: any, usage: any, options: any = {}) {
  const updates = getUsageStatusUpdates(connection, usage, options);
  await syncUsageStatus(connection, updates);
  return updates;
}

export async function applyLiveQuotaUpdate(connection: any, signal: any, options: any = {}) {
  if (!connection?.id || !signal) return null;
  const updates = getUsageStatusUpdates(connection, null, {
    ...options,
    liveSignal: signal,
  });
  await syncUsageStatus(connection, updates);
  return updates;
}


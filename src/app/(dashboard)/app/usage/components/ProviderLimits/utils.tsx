import { getModelsByProviderId } from "../../../../../../../open-sse/config/providerModels";
import { getConnectionCentralizedStatus } from "@/lib/connectionStatus";

/**
 * Format ISO date string to countdown format (inspired by vscode-antigravity-cockpit)
 * @param {string|Date} date - ISO date string or Date object
 * @returns {string} Formatted countdown (e.g., "2d 5h 30m", "4h 40m", "15m") or "-"
 */
export function formatResetTime(date: any) {
  if (!date) return "-";

  try {
    const resetDate = typeof date === "string" ? new Date(date) : new Date(date as any);
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();

    if (diffMs <= 0) return "-";

    const totalMinutes = Math.ceil(diffMs / (1000 * 60));
    
    // < 60 minutes: show only minutes
    if (totalMinutes < 60) {
      return `${totalMinutes}m`;
    }
    
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    
    // < 24 hours: show hours and minutes
    if (totalHours < 24) {
      return `${totalHours}h ${remainingMinutes}m`;
    }
    
    // >= 24 hours: show days, hours, and minutes
    const days = Math.floor(totalHours / 24);
    const remainingHours = totalHours % 24;
    return `${days}d ${remainingHours}h ${remainingMinutes}m`;
  } catch (error) {
    return "-";
  }
}

/**
 * Get Tailwind color class based on percentage
 * @param {number} percentage - Remaining percentage (0-100)
 * @returns {string} Color name: "green" | "yellow" | "red"
 */
export function getStatusColor(percentage) {
  if (percentage > 70) return "green";
  if (percentage >= 30) return "yellow";
  return "red"; // 0-29% including 0% (out of quota) - show red
}

/**
 * Get status emoji based on percentage
 * @param {number} percentage - Remaining percentage (0-100)
 * @returns {string} Emoji: "🟢" | "🟡" | "🔴"
 */
export function getStatusEmoji(percentage) {
  if (percentage > 70) return "🟢";
  if (percentage >= 30) return "🟡";
  return "🔴"; // 0-29% including 0% (out of quota) - show red
}

/**
 * Calculate remaining percentage
 * @param {number} used - Used amount
 * @param {number} total - Total amount
 * @returns {number} Remaining percentage (0-100)
 */
function toFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeQuotaValue(value, fallback = 0) {
  const number = toFiniteNumber(value);
  return number === null ? fallback : number;
}

function getQuotaUsed(quota: any = {}) {
  const used = toFiniteNumber(quota.used);
  if (used !== null) return used;

  const total = toFiniteNumber(quota.total);
  const remaining = toFiniteNumber(quota.remaining);
  if (total !== null && remaining !== null) {
    return Math.max(0, total - remaining);
  }

  return 0;
}

function getQuotaRemainingPercentage(quota: any = {}) {
  const remainingPercentage = toFiniteNumber(quota.remainingPercentage);
  if (remainingPercentage === null || remainingPercentage < 0 || remainingPercentage > 100) return null;
  return remainingPercentage;
}

export function calculatePercentage(used, total) {
  const numericUsed = toFiniteNumber(used);
  const numericTotal = toFiniteNumber(total);

  if (!numericTotal || numericTotal <= 0) return 0;
  if (numericUsed === null || numericUsed < 0) return 100;
  if (numericUsed >= numericTotal) return 0;

  return Math.round(((numericTotal - numericUsed) / numericTotal) * 100);
}

/**
 * Map Antigravity model ID to its provider family (Gemini vs Claude vs Other).
 */
const ANTIGRAVITY_MODEL_FAMILIES: Record<string, string> = {
  "claude-opus-4-6-thinking": "Claude",
  "claude-sonnet-4-6": "Claude",
  "gemini-3.1-pro-high": "Gemini",
  "gemini-3.1-pro-low": "Gemini",
  "gemini-3-flash": "Gemini",
  "gpt-oss-120b-medium": "Other",
};

export function getAntigravityModelFamily(modelKey: string): string {
  if (ANTIGRAVITY_MODEL_FAMILIES[modelKey]) return ANTIGRAVITY_MODEL_FAMILIES[modelKey];
  if (modelKey.startsWith("claude-") || modelKey.startsWith("anthropic/claude-")) return "Claude";
  if (modelKey.startsWith("gemini-")) return "Gemini";
  if (modelKey.startsWith("gpt-")) return "Other";
  return "Other";
}

/**
 * Parse provider-specific quota structures into normalized array
 * @param {string} provider - Provider name (github, antigravity, codex, kiro, claude)
 * @param {Object} data - Raw quota data from provider
 * @returns {Array<Object>} Normalized quota objects with { name, used, total, resetAt }
 */
export function parseQuotaData(provider, data) {
  if (!data || typeof data !== "object") return [];

  const normalizedQuotas = [];

  try {
    switch (provider.toLowerCase()) {
      case "github":
        if (data.quotas) {
          Object.entries(data.quotas).forEach(([name, rawQuota]) => {
            const quota: any = rawQuota;
            normalizedQuotas.push({
              name,
              used: getQuotaUsed(quota),
              total: normalizeQuotaValue(quota.total),
              resetAt: quota.resetAt || null,
            });
          });
        }
        break;

      case "antigravity":
        if (data.quotas) {
          Object.entries(data.quotas).forEach(([modelKey, rawQuota]) => {
            const quota: any = rawQuota;
            const remainingPercentage = getQuotaRemainingPercentage(quota);

            // Determine model family for grouping
            const family = getAntigravityModelFamily(modelKey);

            normalizedQuotas.push({
              name: quota.displayName || modelKey,
              modelKey: modelKey,
              family, // e.g. "Claude", "Gemini", "Other"
              used: getQuotaUsed(quota),
              total: normalizeQuotaValue(quota.total),
              resetAt: quota.resetAt || null,
              ...(remainingPercentage !== null ? { remainingPercentage } : {}),
            });
          });
        }
        break;

      case "codex":
        if (data.quotas) {
          Object.entries(data.quotas).forEach(([quotaType, rawQuota]) => {
            const quota: any = rawQuota;
            if (!quota || typeof quota !== "object") return;

            const remainingPercentage = getQuotaRemainingPercentage(quota);

            normalizedQuotas.push({
              name: quotaType,
              used: getQuotaUsed(quota),
              total: normalizeQuotaValue(quota.total),
              resetAt: quota.resetAt || null,
              remaining: normalizeQuotaValue(quota.remaining, null),
              hasSessionWindow: data.hasSessionWindow === true,
              hasWeeklyWindow: data.hasWeeklyWindow === true,
              usageWindowType: typeof data.usageWindowType === "string" ? data.usageWindowType : undefined,
              ...(remainingPercentage !== null ? { remainingPercentage } : {}),
            });
          });
        }
        break;

      case "kiro":
      case "amazon-q":
        if (data.quotas) {
          Object.entries(data.quotas).forEach(([quotaType, rawQuota]) => {
            const quota: any = rawQuota;
            const remainingPercentage = getQuotaRemainingPercentage(quota);

            normalizedQuotas.push({
              name: quotaType,
              used: getQuotaUsed(quota),
              total: normalizeQuotaValue(quota.total),
              resetAt: quota.resetAt || null,
              ...(remainingPercentage !== null ? { remainingPercentage } : {}),
            });
          });
        }
        break;

      case "claude":
        if (data.message) {
          // Handle error message case
          normalizedQuotas.push({
            name: "error",
            used: 0,
            total: 0,
            resetAt: null,
            message: data.message,
          });
        } else if (data.quotas) {
          Object.entries(data.quotas).forEach(([name, rawQuota]) => {
            const quota: any = rawQuota;
            normalizedQuotas.push({
              name,
              used: getQuotaUsed(quota),
              total: normalizeQuotaValue(quota.total),
              resetAt: quota.resetAt || null,
            });
          });
        }
        break;

      default:
        // Generic fallback for unknown providers
        if (data.quotas) {
          Object.entries(data.quotas).forEach(([name, rawQuota]) => {
            const quota: any = rawQuota;
            normalizedQuotas.push({
              name,
              used: getQuotaUsed(quota),
              total: normalizeQuotaValue(quota.total),
              resetAt: quota.resetAt || null,
            });
          });
        }
    }
  } catch (error) {
    console.error(`Error parsing quota data for ${provider}:`, error);
    return [];
  }

  // Sort quotas according to PROVIDER_MODELS order
  const modelOrder = getModelsByProviderId(provider);
  if (modelOrder.length > 0) {
    const orderMap = new Map(modelOrder.map((m, i) => [m.id, i]));
    
    normalizedQuotas.sort((a, b) => {
      // Use modelKey for antigravity, otherwise use name
      const keyA = a.modelKey || a.name;
      const keyB = b.modelKey || b.name;
      const orderA = orderMap.get(keyA) ?? 999;
      const orderB = orderMap.get(keyB) ?? 999;
      return Number(orderA) - Number(orderB);
    });
  }

  return normalizedQuotas;
}

export function parseStoredUsageSnapshot(connection: any = {}) {
  const snapshot = connection?.usageSnapshot;
  if (!snapshot) return null;

  if (typeof snapshot === "object") {
    return snapshot;
  }

  if (typeof snapshot !== "string") {
    return null;
  }

  try {
    return JSON.parse(snapshot);
  } catch (error) {
    console.warn(`Failed to parse usage snapshot for ${connection?.provider || "provider"}/${connection?.id || "unknown"}:`, error);
    return null;
  }
}

function isRawProviderQuotaErrorMessage(message) {
  if (typeof message !== "string") return false;
  const normalized = message.toLowerCase();

  if (normalized.includes("{") && normalized.includes("error")) {
    try {
      const parsed = JSON.parse(message);
      if (parsed?.error?.type === "usage_limit_reached") return true;
      if (parsed?.error?.message?.toLowerCase().includes("usage limit")) return true;
    } catch {
      // Continue with string checks.
    }
  }

  return normalized.includes("usage_limit_reached")
    || normalized.includes("usage limit has been reached")
    || (normalized.includes("[429]") && normalized.includes("error"));
}

function getSafeQuotaMessage(connection: any = {}, raw: any = null, quotas: any[] = []) {
  const rawMessage = raw?.message || null;
  if (/^Connection test passed\./i.test(rawMessage)) return null;
  if (!rawMessage) return null;
  if (isRawProviderQuotaErrorMessage(rawMessage)) {
    if (quotas.length > 0) return null;
    return connection?.reasonDetail && !isRawProviderQuotaErrorMessage(connection.reasonDetail)
      ? connection.reasonDetail
      : "Quota exhausted. Waiting for the next reset.";
  }
  return rawMessage;
}

function getMissingSnapshotMessage(connection: any = {}) {
  const status = getConnectionCentralizedStatus(connection);
  const reasonDetail = connection?.reasonDetail || null;

  if (status === "exhausted") {
    return reasonDetail || `Usage worker has not returned quota details for ${connection?.provider || "provider"} yet.`;
  }

  if (status === "eligible" || status === "unknown") {
    return reasonDetail || `Usage worker checked ${connection?.provider || "provider"}, but this provider did not return quota details.`;
  }

  return `Usage worker checked ${connection?.provider || "provider"}, but quota details were not returned.`;
}

export function getStoredQuotaPresentation(connection: any = {}) {
  const raw = parseStoredUsageSnapshot(connection);
  const canonicalStatus = getConnectionCentralizedStatus(connection);
  const hasDisabledConnectionIssue = canonicalStatus === "disabled";
  const hasBlockedConnectionIssue = canonicalStatus === "blocked";
  const hasBeenChecked = Boolean(connection?.lastCheckedAt);

  if (hasDisabledConnectionIssue || hasBlockedConnectionIssue) {
    return {
      quotas: [],
      plan: raw?.plan || null,
      message: connection?.reasonDetail || null,
      raw,
      hasSnapshot: Boolean(raw),
    };
  }

  if (!raw) {
    return {
      quotas: [],
      plan: null,
      message: hasBeenChecked
        ? getMissingSnapshotMessage(connection)
        : `Scheduler has not produced quota data for ${connection?.provider || "provider"} yet. This account is still pending its first usage check.`,
      raw: null,
      hasSnapshot: false,
    };
  }

  const quotas = parseQuotaData(connection.provider, raw);

  return {
    quotas,
    plan: raw.plan || null,
    message: getSafeQuotaMessage(connection, raw, quotas) || (quotas.length === 0 ? getMissingSnapshotMessage(connection) : null),
    raw,
    hasSnapshot: true,
  };
}

export function getQuotaPresentation(connection = {}, latestTestResult = null) {
  const stored = getStoredQuotaPresentation(connection);
  if (stored.quotas?.length > 0) {
    return stored;
  }

  if (latestTestResult && latestTestResult.valid === false && latestTestResult.error) {
    const raw = parseStoredUsageSnapshot(connection);
    return {
      quotas: [],
      plan: raw?.plan || null,
      message: latestTestResult.error,
      raw,
      hasSnapshot: Boolean(raw),
    };
  }

  return stored;
}

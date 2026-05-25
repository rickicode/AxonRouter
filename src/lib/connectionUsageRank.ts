import { getConnectionCentralizedStatus, getConnectionCooldownUntil } from "@/lib/connectionStatus";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";

const TRANSIENT_FAILURE_REASON_CODES = new Set([
  "upstream_timeout",
  "transient_upstream_error",
  "usage_request_failed",
]);
const TRANSIENT_FAILURE_PENALTY_WINDOW_MS = 5 * 60 * 1000;

function parseUsageSnapshot(snapshot: any) {
  if (!snapshot) return null;
  if (typeof snapshot === "object") return snapshot;
  if (typeof snapshot !== "string") return null;
  try {
    const parsed = JSON.parse(snapshot);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function finiteNumber(value: any) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function collectCreditBalances(record: any, balances: number[] = []) {
  if (!record || typeof record !== "object") return balances;

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase();
    if (typeof value === "number" || typeof value === "string") {
      const parsed = finiteNumber(value);
      if (parsed !== null && (
        normalizedKey === "balance" ||
        normalizedKey === "remainingcredit" ||
        normalizedKey === "remainingcredits" ||
        normalizedKey === "creditbalance" ||
        normalizedKey === "availablecredit" ||
        normalizedKey === "availablecredits"
      )) {
        balances.push(parsed);
      }
      continue;
    }

    if (value && typeof value === "object") {
      if (normalizedKey.includes("credit") || normalizedKey.includes("balance")) {
        const remaining = finiteNumber((value as any).remaining) ?? finiteNumber((value as any).available) ?? finiteNumber((value as any).balance);
        if (remaining !== null) balances.push(remaining);
      }
      collectCreditBalances(value, balances);
    }
  }

  return balances;
}

function getQuotaRemainingScore(quotas: any) {
  if (!quotas || typeof quotas !== "object") return null;

  let best: number | null = null;
  for (const quota of Object.values(quotas)) {
    if (!quota || typeof quota !== "object") continue;
    const quotaRecord = quota as any;
    const remaining = finiteNumber(quotaRecord.remaining);
    const remainingPercentage = finiteNumber(quotaRecord.remainingPercentage);
    const total = finiteNumber(quotaRecord.total);
    const used = finiteNumber(quotaRecord.used);

    let score: number | null = null;
    if (remainingPercentage !== null) score = remainingPercentage;
    else if (remaining !== null) score = remaining;
    else if (total !== null && used !== null) score = Math.max(0, total - used);

    if (score !== null) best = best === null ? score : Math.max(best, score);
  }

  return best;
}


export function getConnectionRoutingOrderLock(connection: any = {}) {
  const data = connection?.providerSpecificData || {};
  const locked = data.routingOrderLocked === true;
  const order = finiteNumber(data.routingOrder);
  return {
    locked,
    order: order !== null ? order : null,
  };
}

export function isConnectionRoutingOrderLockActive(connection: any = {}) {
  const { locked, order } = getConnectionRoutingOrderLock(connection);
  if (!locked || order === null) return false;
  if (connection?.isActive === false) return false;
  if (getConnectionCooldownUntil(connection)) return false;

  const status = getConnectionCentralizedStatus(connection);
  if (status === "eligible") return true;
  if (status !== "unknown") return false;

  if (["expired", "invalid", "revoked"].includes(String(connection?.authState || ""))) return false;
  if (["error", "failed", "unhealthy", "down"].includes(String(connection?.healthStatus || ""))) return false;
  if (["blocked", "exhausted"].includes(String(connection?.quotaState || ""))) return false;

  return connection?.authType !== "oauth" || !USAGE_SUPPORTED_PROVIDERS.includes(connection?.provider);
}

export function getConnectionUsageAvailabilityScore(connection: any = {}) {
  const snapshot = parseUsageSnapshot(connection?.usageSnapshot);
  if (!snapshot) return null;

  const creditBalances = collectCreditBalances(snapshot);
  if (creditBalances.length > 0) return Math.max(...creditBalances);

  return getQuotaRemainingScore(snapshot.quotas);
}

export function getRecentTransientFailurePenalty(connection: any = {}) {
  const reasonCode = String(connection?.reasonCode || "").toLowerCase();
  if (!TRANSIENT_FAILURE_REASON_CODES.has(reasonCode)) return 0;

  const lastCheckedAt = new Date(String(connection?.lastCheckedAt || "")).getTime();
  if (!Number.isFinite(lastCheckedAt)) return 0;

  const ageMs = Date.now() - lastCheckedAt;
  if (ageMs <= 0 || ageMs >= TRANSIENT_FAILURE_PENALTY_WINDOW_MS) return 0;

  const remainingRatio = 1 - (ageMs / TRANSIENT_FAILURE_PENALTY_WINDOW_MS);
  return Math.max(0, Math.min(1, remainingRatio));
}

export function compareConnectionsByUsageAvailability(left: any = {}, right: any = {}) {
  const leftLockActive = isConnectionRoutingOrderLockActive(left);
  const rightLockActive = isConnectionRoutingOrderLockActive(right);

  if (leftLockActive || rightLockActive) {
    if (leftLockActive && !rightLockActive) return -1;
    if (!leftLockActive && rightLockActive) return 1;

    const leftOrder = getConnectionRoutingOrderLock(left).order ?? 999;
    const rightOrder = getConnectionRoutingOrderLock(right).order ?? 999;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }

  const leftTransientPenalty = getRecentTransientFailurePenalty(left);
  const rightTransientPenalty = getRecentTransientFailurePenalty(right);
  if (leftTransientPenalty !== rightTransientPenalty) return rightTransientPenalty - leftTransientPenalty;

  const leftScore = getConnectionUsageAvailabilityScore(left);
  const rightScore = getConnectionUsageAvailabilityScore(right);

  if (leftScore !== null && rightScore !== null && leftScore !== rightScore) return rightScore - leftScore;
  if (leftScore !== null && rightScore === null) return -1;
  if (leftScore === null && rightScore !== null) return 1;

  const leftPriority = Number.isFinite(Number(left?.priority)) ? Number(left.priority) : 999;
  const rightPriority = Number.isFinite(Number(right?.priority)) ? Number(right.priority) : 999;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;

  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

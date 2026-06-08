import { USAGE_SUPPORTED_PROVIDERS } from "../shared/constants/providers";

type ConnectionLike = Record<string, any>;

type ModelLock = {
  key: string;
  model: string;
  until: string;
};

function getFutureTimestamp(value: any) {
  const timestamp = new Date(value).getTime();
  if (!value || !Number.isFinite(timestamp) || timestamp <= Date.now()) return null;
  return new Date(timestamp).toISOString();
}

function requiresUsageSnapshotForEligibility(connection: ConnectionLike = {}) {
  return connection?.authType === "oauth"
    && USAGE_SUPPORTED_PROVIDERS.includes(connection?.provider);
}

function hasUsageSnapshot(connection: ConnectionLike = {}) {
  return connection?.usageSnapshot !== undefined && connection?.usageSnapshot !== null;
}

export function getConnectionActiveModelLocks(connection: ConnectionLike = {}) {
  return Object.entries(connection || {}).reduce<ModelLock[]>((locks, [key, value]) => {
    if (!key.startsWith("modelLock_")) return locks;

    const until = getFutureTimestamp(value);
    if (!until) return locks;

    locks.push({
      key,
      model: key.slice("modelLock_".length) || "__all",
      until,
    });

    return locks;
  }, []);
}

export function getConnectionCooldownUntil(connection: ConnectionLike = {}) {
  const timestamps = [
    getFutureTimestamp(connection?.nextRetryAt),
    getFutureTimestamp(connection?.resetAt),
    ...getConnectionActiveModelLocks(connection).map((lock) => lock.until),
  ].filter(Boolean);

  if (timestamps.length === 0) return null;
  return timestamps.sort()[0];
}

export function getConnectionProviderCooldownUntil(connection: ConnectionLike = {}) {
  const timestamps = [
    getFutureTimestamp(connection?.nextRetryAt),
    getFutureTimestamp(connection?.resetAt),
  ].filter(Boolean);

  if (timestamps.length === 0) return null;
  return timestamps.sort()[0];
}

function getCentralizedStatus(connection: ConnectionLike = {}) {
  if (connection?.reasonCode === "reauthorization_required") {
    return { status: "disabled", source: "reasonCode" };
  }

  const needsUsageSnapshot = requiresUsageSnapshotForEligibility(connection);
  const hasUsageEvidence = hasUsageSnapshot(connection);

  switch (connection?.authState) {
    case "invalid":
    case "revoked":
      return { status: "disabled", source: "authState" };
    case "expired":
      return { status: "blocked", source: "authState" };
    default:
      break;
  }

  switch (connection?.healthStatus) {
    case "error":
    case "failed":
    case "unhealthy":
    case "down":
      return { status: "blocked", source: "healthStatus" };
    default:
      break;
  }

  switch (connection?.quotaState) {
    case "exhausted":
    case "blocked":
      return { status: "exhausted", source: "quotaState" };
    case "ok":
      if (connection?.authState === "ok" && connection?.healthStatus === "healthy") {
        if (needsUsageSnapshot && !hasUsageEvidence) {
          return { status: "unknown", source: "missingUsageSnapshot" };
        }
        return { status: "eligible", source: "quotaState" };
      }
      break;
    default:
      break;
  }

  switch (connection?.routingStatus) {
    case "eligible":
      if (needsUsageSnapshot && !hasUsageEvidence) {
        return { status: "unknown", source: "missingUsageSnapshot" };
      }
      return { status: connection.routingStatus, source: "routingStatus" };
    case "exhausted":
    case "blocked":
    case "unknown":
    case "disabled":
      return { status: connection.routingStatus, source: "routingStatus" };
    default:
      break;
  }

  return null;
}

const CONNECTION_FILTER_STATUSES = new Set([
  "all",
  "eligible",
  "exhausted",
  "blocked",
  "disabled",
  "unknown",
]);

export function normalizeConnectionFilterStatus(value: string) {
  return CONNECTION_FILTER_STATUSES.has(value) ? value : "all";
}

export function getConnectionStatusDetails(connection: ConnectionLike | null | undefined) {
  if (!connection || typeof connection !== "object") {
    return {
      status: "unknown",
      source: "missing",
      hasActiveModelLock: false,
      cooldownUntil: null,
      activeModelLocks: [],
    };
  }

  if (connection.isActive === false) {
    return {
      status: "disabled",
      source: "isActive",
      hasActiveModelLock: false,
      cooldownUntil: null,
      activeModelLocks: [],
    };
  }

  const activeModelLocks = getConnectionActiveModelLocks(connection);
  const cooldownUntil = getConnectionCooldownUntil(connection);
  const centralized = getCentralizedStatus(connection);

  if (centralized) {
    return {
      status: centralized.status,
      source: centralized.source,
      hasActiveModelLock: activeModelLocks.length > 0,
      cooldownUntil,
      activeModelLocks,
    };
  }

  return {
    status: "unknown",
    source: "unknown",
    hasActiveModelLock: activeModelLocks.length > 0,
    cooldownUntil,
    activeModelLocks,
  };
}

export function getConnectionEffectiveStatus(connection: ConnectionLike | null | undefined) {
  return getConnectionStatusDetails(connection).status;
}

export function getConnectionCentralizedStatus(connection: ConnectionLike = {}) {
  const details = getConnectionStatusDetails(connection);
  return details.status;
}

// Plan/tier values that are placeholders rather than a real, API-reported subscription tier.
const PLACEHOLDER_PLAN_TYPES = new Set(["legacy-tier", "legacy", "unknown", ""]);

/**
 * Returns the displayable account/subscription tier label, or null when the stored
 * planType is a placeholder (e.g. Antigravity "legacy-tier") that does not represent a
 * real, API-reported subscription. Used to hide the account-type badge whenever the
 * subscription status can't be reliably read from the provider API.
 */
export function getDisplayPlanType(connection: ConnectionLike = {}): string | null {
  if (connection?.provider === "antigravity" && connection?.providerSpecificData?.isWorkspaceAccount) {
    return "PRO";
  }
  const raw = connection?.providerSpecificData?.planType;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_PLAN_TYPES.has(trimmed.toLowerCase())) return null;

  if (connection?.provider === "antigravity") {
    const lower = trimmed.toLowerCase();
    if (lower.includes("ultra")) return "ULTRA";
    if (lower.includes("pro")) return "PRO";
    if (lower.includes("free")) return "FREE";
  }
  return trimmed;
}

export function getConnectionFilterStatus(connection: ConnectionLike = {}) {
  const status = getConnectionCentralizedStatus(connection);

  switch (status) {
    case "eligible":
      return "eligible";
    case "exhausted":
      return "exhausted";
    case "blocked":
      return "blocked";
    case "disabled":
      return "disabled";
    default:
      return "unknown";
  }
}

export function getConnectionStatusBadgeMeta(connection: ConnectionLike = {}) {
  const status = getConnectionCentralizedStatus(connection);

  switch (status) {
    case "eligible":
      return { status, label: "Eligible", variant: "success" };
    case "exhausted":
      return { status, label: "Exhausted", variant: "warning" };
    case "blocked":
      return { status, label: "Blocked", variant: "error" };
    case "disabled":
      return { status, label: "Disabled", variant: "default" };
    default:
      return { status: "unknown", label: "Unknown", variant: "default" };
  }
}

/**
 * Per-provider usage refresh strategy.
 * Centralizes all provider-specific behavior so the main refresh loop stays generic.
 */

export interface UsageRefreshStrategy {
  /** Fetch provider usage. Defaults to the shared getUsageForProvider adapter. */
  fetchUsage: ((connection: any, options?: any) => Promise<any>) | null;
  /** Normalize raw provider usage into the canonical snapshot stored by the worker. */
  normalizeUsage: ((rawUsage: any, connection: any, options?: any) => any) | null;
  /** Whether the usage response MUST contain quota data (throws if missing) */
  requiresQuota: boolean;
  /** Fetch timeout in ms */
  timeoutMs: number;
  /** Provider-specific retryability hook. Null means worker uses generic retry rules. */
  isRetryable: ((error: any, context?: any) => boolean) | null;
  /** On transient usage failure, try credential refresh via connection test before retry */
  refreshCredentialsOnFailure: boolean;
  /** Backcompat alias while older callers still reference the old field. */
  credentialRefreshOnTransientFailure: boolean;
  /** Detect a "temporary auth" response that can be recovered by re-running connection test */
  isTemporaryAuthResponse: ((usage: any) => boolean) | null;
  /** Detect a recoverable auth-expired usage response (triggers forced credential refresh + retry) */
  isRecoverableAuthExpiry: ((connection: any, usage: any) => boolean) | null;
  /** Post-success hook (e.g. persist plan type) */
  onSuccess: ((connection: any, usage: any) => Promise<void>) | null;
  /** Post-failure hook for provider-specific state cleanup. */
  onFailure: ((connection: any, error: any) => Promise<void>) | null;
  /** On final USAGE_QUOTA_UNAVAILABLE, silently skip instead of throwing */
  skipOnQuotaUnavailable: boolean;
}

const KIRO_RECOVERABLE_MESSAGES = new Set([
  "Kiro quota API rejected the current token. Chat may still work.",
  "Kiro quota API is unavailable for the current social login session. Chat may still work. If this persists, reconnect Kiro.",
]);

const KIRO_RECOVERABLE_AUTH_METHODS = new Set(["builder-id", "google", "github", "imported"]);

function isKiroRecoverableAuthExpiry(connection: any, usage: any): boolean {
  if (!connection?.refreshToken) return false;
  const authMethod = String(connection?.providerSpecificData?.authMethod || "builder-id").toLowerCase();
  if (authMethod === "idc" || !KIRO_RECOVERABLE_AUTH_METHODS.has(authMethod)) return false;
  const message = typeof usage?.message === "string" ? usage.message : "";
  return KIRO_RECOVERABLE_MESSAGES.has(message);
}

function isCodexTemporaryAuth(usage: any): boolean {
  const message = typeof usage?.message === "string" ? usage.message : "";
  return /^Codex connected\. Usage API temporarily unavailable \(401\)\.?$/.test(message);
}

const DEFAULT: UsageRefreshStrategy = {
  fetchUsage: null,
  normalizeUsage: null,
  requiresQuota: false,
  timeoutMs: 5000,
  isRetryable: null,
  refreshCredentialsOnFailure: false,
  credentialRefreshOnTransientFailure: false,
  isTemporaryAuthResponse: null,
  isRecoverableAuthExpiry: null,
  onSuccess: null,
  onFailure: null,
  skipOnQuotaUnavailable: false,
};

const STRATEGIES: Record<string, Partial<UsageRefreshStrategy>> = {
  codex: {
    requiresQuota: true,
    timeoutMs: 10000,
    credentialRefreshOnTransientFailure: true,
    isTemporaryAuthResponse: isCodexTemporaryAuth,
    skipOnQuotaUnavailable: true,
  },
  claude: {
    timeoutMs: 10000,
  },
  antigravity: {
    requiresQuota: true,
    timeoutMs: 10000,
    credentialRefreshOnTransientFailure: true,
  },
  "gemini-cli": {
    requiresQuota: true,
    timeoutMs: 10000,
    credentialRefreshOnTransientFailure: true,
  },
  github: {
    timeoutMs: 10000,
  },
  kiro: {
    timeoutMs: 10000,
    isRecoverableAuthExpiry: isKiroRecoverableAuthExpiry,
  },
  "amazon-q": {
    timeoutMs: 10000,
    isRecoverableAuthExpiry: isKiroRecoverableAuthExpiry,
  },
};

export function getProviderStrategy(provider: string | undefined): UsageRefreshStrategy {
  const strategy = { ...DEFAULT, ...(STRATEGIES[provider || ""] || {}) };
  strategy.refreshCredentialsOnFailure =
    strategy.refreshCredentialsOnFailure || strategy.credentialRefreshOnTransientFailure;
  strategy.credentialRefreshOnTransientFailure = strategy.refreshCredentialsOnFailure;
  return strategy;
}

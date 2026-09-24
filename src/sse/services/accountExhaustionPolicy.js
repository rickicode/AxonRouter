/**
 * Account exhaustion policy.
 *
 * Semantic definition:
 * "exhausted" (testStatus = "exhausted") is a TERMINAL state where EVERY model
 * on the account is unusable because global credits / pooled quota have hit zero.
 *
 * In contrast:
 * - Model-specific rate limits / quota hits are "modelLock" (transient, testStatus stays active).
 * - Timed account-wide caps (daily/monthly limits that reset at a known time) ride a
 *   temporary account lock (testStatus = "unavailable"), NOT "exhausted".
 * - Free-tier providers whose free models continue to serve even after paid credits run out
 *   must NEVER have testStatus = "exhausted".
 */

import {
  getQuotaCacheEntry,
  isQuotaMapExhausted,
  setQuotaCache,
} from "@/domain/quotaCache.js";
import { isRefreshBlockedMarker } from "open-sse/services/accountFallback.js";
import { setAccountCooldown, clearModelCooldown } from "@/lib/cache/client.js";
import * as localDb from "@/lib/localDb";
import * as log from "../utils/logger.js";

function getLocalDbFn(name) {
  try {
    const fn = localDb[name];
    return typeof fn === "function" ? fn : null;
  } catch {
    return null;
  }
}

// Providers whose free models keep serving after paid credits die, or whose
// quota resets on a timer — must never carry account-level "exhausted".
export const NEVER_ACCOUNT_EXHAUSTED_PROVIDERS = new Set([
  // registry category "free" (free-only pools)
  "devin-cli",
  "freebuff",
  "gemini-cli",
  "opencode",
  "kiro",
  "kilocode-free",
  "ovhcloud-free",
  "llmtech-free",
  "llm7-free",

  // registry category "freeTier" — except cloudflare-ai, whose daily neuron
  // budget is pooled across every model (true account-wide exhaustion)
  "coqui",
  "searxng",
  "byteplus",
  "api-airforce",
  "edge-tts",
  "kimchi",
  "vertex",
  "nvidia",
  "tortoise",
  "kilo-gateway",
  "bazaarlink",
  "local-device",
  "gemini",
  "ollama",
  "google-tts",
  "poolside",
  "openrouter",

  // free models survive paid-credit death / model-scoped billing
  "cline",
  "cline-free",
  "kilocode",
  "opencode-zen",
  "bai",

  // timed recovery (monthly cap) -> "unavailable", never terminal
  "github",
]);

/**
 * Check if a provider can ever have an account marked as "exhausted".
 *
 * @param {string|null} providerId
 * @returns {boolean}
 */
export function providerAllowsAccountExhausted(providerId) {
  if (!providerId) return false;
  return !NEVER_ACCOUNT_EXHAUSTED_PROVIDERS.has(providerId);
}

const CREDIT_QUOTA_RE =
  /credit|balance|insufficient|exhaust|deplet|billing|payment|quota|allocation|neurons|预扣费额度失败|剩余额度|额度不足/i;

/**
 * Check if the error message reflects depleted credits/quota.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isCreditQuotaErrorText(text) {
  return CREDIT_QUOTA_RE.test(String(text || ""));
}

/**
 * Check whether an account is truly exhausted globally across all models.
 *
 * @param {string} connectionId
 * @param {string} providerId
 * @param {object|null} snapshot
 * @returns {boolean}
 */
export function isAccountFullyExhausted(connectionId, providerId, snapshot = null) {
  if (!providerId || !providerAllowsAccountExhausted(providerId)) {
    return false;
  }

  if (providerId === "antigravity") {
    return Boolean(getQuotaCacheEntry(connectionId)?.exhausted || (snapshot && isQuotaMapExhausted(snapshot.quotas)));
  }

  // Non-antigravity providers that allow exhaustion (e.g. unikey, codebuddy, cloudflare-ai)
  // are evaluated via error rules and snapshot status in caller.
  return false;
}
/**
 * Determine if a usage snapshot or live usage payload indicates available quota.
 *
 * @param {string} provider
 * @param {object} options
 * @param {object|null} options.quotas
 * @param {number|null} options.remainingPct
 * @param {object|null} options.usage
 * @returns {boolean}
 */
export function isQuotaAvailable(provider, { quotas, remainingPct, usage } = {}) {
  if (provider === "antigravity") {
    return quotas ? !isQuotaMapExhausted(quotas) : false;
  }

  if (usage && typeof usage === "object") {
    if (typeof usage.remainingPercentage === "number" && usage.remainingPercentage > 0) {
      return true;
    }
    if (typeof usage.remaining === "number" && usage.remaining > 0) {
      return true;
    }
    if (!usage.error && !usage.isExhausted && (usage.plan || usage.tokens || usage.credits)) {
      return true;
    }
  }

  if (quotas && typeof quotas === "object") {
    for (const [, q] of Object.entries(quotas)) {
      if (!q || typeof q !== "object") continue;
      if (typeof q.remainingPercentage === "number" && q.remainingPercentage > 0) return true;
      if (typeof q.remaining === "number" && q.remaining > 0) return true;
      if (typeof q.total === "number" && typeof q.used === "number" && q.used < q.total) return true;
      if (typeof q.percent_used === "number" && q.percent_used < 100) return true;
      if (typeof q.used_percent === "number" && q.used_percent < 100) return true;
    }
  }

  return false;
}

/**
 * Universal auto-heal for ANY provider connection when quota/usage is restored.
 * Clears exhausted testStatus, lockedAllUntil, and modelLocks for available models.
 *
 * @param {string} connectionId
 * @param {object} options
 * @param {string} options.provider
 * @param {object|null} options.quotas
 * @param {number|null} options.remainingPct
 * @param {object|null} options.usage
 * @param {object|null} existingConn
 * @returns {Promise<boolean>}
 */
export async function autoHealConnectionOnQuotaRestored(
  connectionId,
  { provider, quotas, remainingPct, usage } = {},
  existingConn = null
) {
  if (!connectionId) return false;

  if (provider === "antigravity" && quotas) {
    if (!isQuotaAvailable(provider, { quotas, remainingPct, usage })) return false;
    await setQuotaCache(connectionId, quotas, { provider: "antigravity" });
    return true;
  }

  if (!isQuotaAvailable(provider, { quotas, remainingPct, usage })) {
    return false;
  }

  const now = Date.now();
  try {
    const getConn = getLocalDbFn("getProviderConnectionById");
    const updateConn = getLocalDbFn("updateProviderConnection");
    if (!updateConn) return false;
    const conn = existingConn || (getConn ? await getConn(connectionId).catch(() => null) : null);
    if (!conn) return false;

    const refreshBlocked = isRefreshBlockedMarker(conn?.providerSpecificData?.refreshBlocked);
    const isFatal = typeof conn?.lastError === "string"
      && /\b(account has been banned|account has been deleted|suspended|revoked|invalid_grant|invalid token|invalid api key|unauthorized|forbidden)\b/i.test(conn.lastError);
    if (conn.isActive === false || conn.testStatus === "disabled" || refreshBlocked || isFatal) {
      return false;
    }

    const hasExhaustedLock = conn.testStatus === "exhausted"
      || (conn.lockedAllUntil && new Date(conn.lockedAllUntil).getTime() > now)
      || (conn.modelLock___all && new Date(conn.modelLock___all).getTime() > now)
      || (conn.rateLimitedUntil && new Date(conn.rateLimitedUntil).getTime() > now);
    const isUnavailableStatus = conn.testStatus === "unavailable" && (hasExhaustedLock || !conn.lastError);

    const modelUpdates = {};
    const jsonLocks = { ...(conn.modelLocks || {}) };
    let modelLocksChanged = false;

    if (quotas && typeof quotas === "object") {
      for (const [m, q] of Object.entries(quotas)) {
        if (!q || typeof q !== "object") continue;
        const hasModelQuota =
          (typeof q.remainingPercentage === "number" && q.remainingPercentage > 0) ||
          (typeof q.remaining === "number" && q.remaining > 0) ||
          (typeof q.total === "number" && typeof q.used === "number" && q.used < q.total) ||
          (typeof q.percent_used === "number" && q.percent_used < 100) ||
          (typeof q.used_percent === "number" && q.used_percent < 100);

        if (hasModelQuota) {
          if (conn[`modelLock_${m}`]) {
            modelUpdates[`modelLock_${m}`] = null;
          }
          if (jsonLocks[m]) {
            delete jsonLocks[m];
            modelLocksChanged = true;
          }
          clearModelCooldown(connectionId, m).catch(() => {});
        }
      }
    }

    if (hasExhaustedLock || isUnavailableStatus || modelLocksChanged || Object.keys(modelUpdates).length > 0) {
      const updates = {
        ...modelUpdates,
        ...(hasExhaustedLock || isUnavailableStatus ? {
          testStatus: "active",
          lockedAllUntil: null,
          modelLock___all: null,
          rateLimitedUntil: null,
          lastError: null,
          errorCode: null,
        } : {}),
        ...(modelLocksChanged ? { modelLocks: jsonLocks } : {}),
      };
      await updateConn(connectionId, updates);
      if (hasExhaustedLock || isUnavailableStatus) setAccountCooldown(connectionId, 0).catch(() => {});
      log.info("AUTH", `${provider || conn.provider} [${connectionId.slice(0, 8)}] quota restored upstream — auto-cleared locks & activated connection`);
      return true;
    }
  } catch (err) {
    log.warn("AUTH", `${connectionId.slice(0, 8)} | auto-heal on quota restore failed: ${err.message}`);
  }
  return false;
}

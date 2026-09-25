import { getProviderConnections, validateApiKey, updateProviderConnection, getSettings, getProxyPools } from "@/lib/localDb";
import * as localDb from "@/lib/localDb";
import { resolveConnectionProxyConfig, pickProxyPoolId } from "@/lib/network/connectionProxy";
import { formatRetryAfter, checkFallbackError, isFatalAuthError, isModelLockActive, isRefreshBlockedMarker, buildModelLockUpdate, getEarliestModelLockUntil } from "open-sse/services/accountFallback.js";
import { MAX_RATE_LIMIT_COOLDOWN_MS, DEFAULT_RATE_LIMIT_COOLDOWN_MS, DEAD_CIRCUIT_THRESHOLD, DEAD_CIRCUIT_WINDOW_S, LKG_TTL_S } from "open-sse/config/errorConfig.js";
import { resolveProviderId, FREE_PROVIDERS } from "@/shared/constants/providers.js";
import {
  getQuotaCacheEntry,
  hydrateQuotaCacheFromSnapshots,
  isQuotaExhaustedForRequest,
  isQuotaMapExhausted,
  earliestResetAt,
  refreshQuota,
  setQuotaCache,
} from "@/domain/quotaCache.js";
import {
  getAntigravityQuotaCache,
  isAntigravityAccountQuotaExhausted,
  refreshAntigravityQuota,
} from "./antigravityQuota.js";
import { getFreebuffQuotaCache, verifyFreebuffAccountDirect } from "open-sse/services/usage/freebuff.js";
import { canonicalFreebuffModel } from "open-sse/executors/freebuff.js";
import {
  setAccountCooldown as cacheSetAccountCooldown,
  isAccountInCooldown as cacheIsAccountInCooldown,
  setModelCooldown as cacheSetModelCooldown,
  isModelInCooldown as cacheIsModelInCooldown,
  getBatchCooldowns,
  getCachedConnections,
  setCachedConnections,
  invalidateCachedConnections,
  getLkg,
  setLkg,
  delLkg,
  incrDeadCircuit,
  resetDeadCircuit,
  getDeadCircuit,
  isProviderDead,
  setProviderDead,
  incrModelFailCount,
  resetModelFailCount,
} from "@/lib/cache/client.js";
import { providerAllowsAccountExhausted, isCreditQuotaErrorText, isAccountFullyExhausted } from "./accountExhaustionPolicy.js";
import * as log from "../utils/logger.js";
import { bumpRoutingMetric } from "open-sse/services/routingMetrics.js";

// Per-provider mutex map to prevent race conditions during account selection without blocking unrelated providers
const selectionMutexes = new Map();

export function filterConnectionsForModel(providerId, connections, model, settings = {}) {
  const override = (settings.providerStrategies || {})[providerId] || {};
  if (override.strictModelAssignment !== true || !model) {
    return connections;
  }
  return connections.filter((connection) => {
    const assignedModel = connection.providerSpecificData?.assignedModel
      || (providerId === "freebuff" ? connection.providerSpecificData?.freebuffModel : null);
    return assignedModel === model;
  });
}
const ANTIGRAVITY_MODEL_LOCK_MS = 24 * 60 * 60 * 1000;

const GITHUB_MONTHLY_USAGE_LIMIT = "you've reached your additional usage limit for your plan";

function githubMonthlyResetMs(status, errorText, provider) {
  if (resolveProviderId(provider) !== "github" || Number(status) !== 402) return null;
  if (!String(errorText || "").toLowerCase().includes(GITHUB_MONTHLY_USAGE_LIMIT)) return null;
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}
function cloudflareDailyResetMs(status, errorText, provider) {
  if (resolveProviderId(provider) !== "cloudflare-ai") return null;
  if (!/daily free allocation|10,000 neurons/i.test(String(errorText || ""))) return null;
  const now = new Date();
  const todayReset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 1, 0, 0);
  return now.getTime() < todayReset
    ? todayReset
    : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 1, 0, 0);
}
// Safe accessor for optional localDb helpers. Direct property access throws
// under vitest strict mocks that omit newer exports, and typeof-access throws
// there too — so probe inside try/catch. Returns the function or null.
function getLocalDbFn(name) {
  try {
    const fn = localDb[name];
    return typeof fn === "function" ? fn : null;
  } catch {
    return null;
  }
}

function isSameFreebuffModel(connModel, targetModel) {
  if (!connModel || !targetModel) return false;
  if (connModel === targetModel) return true;
  const canonicalConn = canonicalFreebuffModel(connModel);
  const canonicalTarget = canonicalFreebuffModel(targetModel);
  if (canonicalConn === canonicalTarget) return true;
  const cleanA = String(connModel).replace(/^(freebuff|fb)\//i, "");
  const cleanB = String(targetModel).replace(/^(freebuff|fb)\//i, "");
  if (cleanA === cleanB) return true;
  const baseA = cleanA.split("/").pop();
  const baseB = cleanB.split("/").pop();
  return baseA === baseB;
}

export function classifyBlockedCredentials(provider, model, connections, { cooledDown = false } = {}) {
  const breakdown = {
    total: connections.length,
    accountExhausted: 0,
    modelExhausted: 0,
    unavailable: 0,
    disabled: 0,
    coolingDown: cooledDown ? connections.length : 0,
  };
  const accountLocks = new Set();
  const modelLocks = new Set();
  const blockedNames = [];
  const retryExpiries = [];

  for (const connection of connections) {
    // Strict buckets mirror SQL: DISABLED is purely is_active=false (disable
    // paths always sync the column with the data.disabledAt marker, and
    // rowToConnection already folds stale markers into isActive). Exhausted
    // rows must never count as disabled.
    const disabled = connection.isActive === false;
    const refreshBlocked = isRefreshBlockedMarker(connection.providerSpecificData?.refreshBlocked);
    const fatalError = typeof connection.lastError === "string"
      && /\b(account has been banned|account has been deleted|suspended|revoked|invalid_grant|invalid token|invalid api key|unauthorized|forbidden)\b/i.test(connection.lastError);
    const accountLock =
      (connection.lockedAllUntil && new Date(connection.lockedAllUntil).getTime() > Date.now())
      || (connection.rateLimitedUntil && new Date(connection.rateLimitedUntil).getTime() > Date.now())
      || (connection.modelLocks?.__all && new Date(connection.modelLocks.__all).getTime() > Date.now())
      || (connection.modelLock___all && new Date(connection.modelLock___all).getTime() > Date.now());
    const modelLockValue = Boolean(model) && (connection[`modelLock_${model}`] || connection.modelLocks?.[model]);
    const modelLock = modelLockValue && Number.isFinite(new Date(modelLockValue).getTime())
      && new Date(modelLockValue).getTime() > Date.now();
    // Account-wide locks make the account unavailable (no model can use it);
    // only test_status=exhausted counts as exhausted.
    const unavailable = refreshBlocked || fatalError || accountLock || ["unavailable", "error", "expired", "invalid"].includes(connection.testStatus);
    const connName = connection.name || connection.email || connection.displayName
      || (connection.id ? `${connection.id.slice(0, 8)}...` : "unknown");

    // Strict order: model-lock > disabled > exhausted > unavailable.
    // Exhausted rows must not be counted as disabled, and unavailable is
    // only for permanent errors / account locks.
    if (modelLock) {
      breakdown.modelExhausted++;
      modelLocks.add(connection.id);
      const expiry = getEarliestModelLockUntil(connection, model);
      if (expiry) retryExpiries.push(expiry);
      blockedNames.push(connName);
    } else if (disabled) {
      breakdown.disabled++;
      blockedNames.push(connName);
    } else if (connection.testStatus === "exhausted") {
      breakdown.accountExhausted++;
      accountLocks.add(connection.id);
      const expiry = getEarliestModelLockUntil(connection, null);
      if (expiry) retryExpiries.push(expiry);
      blockedNames.push(connName);
    } else if (unavailable) {
      breakdown.unavailable++;
      blockedNames.push(connName);
    }
  }

  const blocked = breakdown.accountExhausted + breakdown.modelExhausted
    + breakdown.unavailable + breakdown.disabled + breakdown.coolingDown;
  if (blocked === 0) return null;

  // Fleet-health signal: half or more of the fleet blocked → loud WARN so
  // monitoring catches fleet-wide exhaustion/disables without dashboard patrol.
  if (connections.length >= 3 && blocked / connections.length >= 0.5) {
    log.warn("FLEET", `${provider} | ${blocked}/${connections.length} accounts blocked for ${model || "any"} (accountExhausted=${breakdown.accountExhausted}, modelExhausted=${breakdown.modelExhausted}, unavailable=${breakdown.unavailable}, disabled=${breakdown.disabled})`);
  }

  const allAccountExhausted = breakdown.accountExhausted === connections.length;
  const onlyModelExhausted = breakdown.modelExhausted > 0
    && breakdown.modelExhausted === connections.length;
  // All active (non-disabled) connections are model-locked — disabled accounts are just
  // dead keys and don't count against the model availability assessment.
  const activeConnections = connections.filter((c) => c.isActive !== false);
  const allActiveModelExhausted = activeConnections.length > 0
    && model
    && activeConnections.every((c) => {
      const v = c[`modelLock_${model}`] || c.modelLocks?.[model];
      return v && Number.isFinite(new Date(v).getTime()) && new Date(v).getTime() > Date.now();
    });
  const allModelExhausted = onlyModelExhausted || allActiveModelExhausted;
  const allBlockedBySameState = breakdown.accountExhausted + breakdown.modelExhausted + breakdown.unavailable + breakdown.disabled === connections.length;
  const code = allAccountExhausted
    ? "ACCOUNT_EXHAUSTED"
    : allModelExhausted
      ? "MODEL_EXHAUSTED"
      : allBlockedBySameState && breakdown.unavailable + breakdown.disabled === connections.length
        ? "ACCOUNT_UNAVAILABLE"
        : "MIXED_BLOCKED";
  const message = code === "ACCOUNT_EXHAUSTED"
    ? `All ${provider} accounts are exhausted (account quota/credits).`
    : code === "MODEL_EXHAUSTED"
      ? `Model ${model} is exhausted for all ${provider} accounts.`
      : code === "ACCOUNT_UNAVAILABLE"
        ? `All ${provider} accounts are unavailable or disabled.`
        : `No usable ${provider} credentials for ${model || "requested model"}.`;
  const retryAfter = retryExpiries.sort()[0] || null;

  if (code) {
    return {
      allRateLimited: true,
      retryAfter,
      retryAfterHuman: retryAfter
        ? formatRetryAfter(retryAfter)
        : code === "ACCOUNT_EXHAUSTED" || code === "MODEL_EXHAUSTED"
          ? "quota reset time unavailable"
          : "until an account is available",
      lastError: message,
      lastErrorCode: code,
      statusBreakdown: breakdown,
      blockedConnectionIds: [...accountLocks, ...modelLocks],
      blockedNames: blockedNames.slice(0, 5),
    };
  }
}


function isAntigravityModelCacheExhausted(connectionId, model) {
  const quotas = getAntigravityQuotaCache().get(connectionId);
  if (!quotas) return false;
  const bare = String(model || "").replace(/^(antigravity|agy)\//, "").toLowerCase();
  const quota = quotas[bare] || quotas[model];
  if (!quota || typeof quota.remainingPercentage !== "number") return false;
  if (quota.remainingPercentage > 0) return false;
  if (quota.resetAt && new Date(quota.resetAt).getTime() <= new Date().getTime()) return false;
  return true;
}

/**
 * Durable + transient eligibility filter shared by the window scan and the
 * last-known-good fast path. Returns true when the connection may serve
 * provider/model right now. Pure w.r.t. its inputs (no I/O).
 */

function isConnectionRoutable(c, ctx) {
  const { excludeSet, cooledDownIds, model, providerId, isAntigravity, isFreebuff, freebuffQuotaCache } = ctx;
  if (!c || excludeSet.has(c.id)) return false;
  if (cooledDownIds?.has(c.id)) return false;
  // Background refresh writes string markers ("invalid_grant", …) — use the
  // shared helper instead of a strict boolean check or dead accounts route.
  const refreshBlocked = isRefreshBlockedMarker(c.providerSpecificData?.refreshBlocked);
  const fatalError = typeof c.lastError === "string"
    && /\b(account has been banned|account has been deleted|suspended|revoked|invalid_grant|invalid token|invalid api key|unauthorized|forbidden)\b/i.test(c.lastError);
  if (c.isActive === false || c.disabledAt || c.testStatus === "disabled" || refreshBlocked || fatalError) return false;
  // unavailable/exhausted ride a timed account-wide lock: once the lock window
  // (lockedAllUntil / rateLimitedUntil) lapses the account must become
  // routable again. Only hard-block while that window is still live —
  // otherwise the status row permanently locks the account with no sweeper
  // to reset it. "error"/"expired"/"invalid" carry no expiry semantics in
  // practice and stay blocked until an admin/success resets them.
  if (c.testStatus === "exhausted" || c.testStatus === "unavailable") {
    // These statuses ride a timed account-wide lock. If the lock window has
    // visibly lapsed (timestamp present but past) the account must become
    // routable again — no sweeper resets stale status rows. With NO lock
    // timestamp at all the status is a durable verdict (admin-set /
    // permanent exhaustion) and stays blocked.
    const hasLockWindow = Boolean(c.lockedAllUntil || c.rateLimitedUntil);
    const lockLive = (c.lockedAllUntil && new Date(c.lockedAllUntil).getTime() > Date.now())
      || (c.rateLimitedUntil && new Date(c.rateLimitedUntil).getTime() > Date.now());
    if (!hasLockWindow || lockLive) return false;
    // Expired account lock: continue into quota-cache checks. A fresh snapshot
    // may still prove this specific request is exhausted.
  }
  if (["error", "expired", "invalid"].includes(c.testStatus)) return false;
  if (c.rateLimitedUntil && new Date(c.rateLimitedUntil).getTime() > Date.now()) return false;
  if (c.lockedAllUntil && new Date(c.lockedAllUntil).getTime() > Date.now()) return false;
  if (isAntigravity && model && (isQuotaExhaustedForRequest(c.id, providerId, model) || isAntigravityModelCacheExhausted(c.id, model))) return false;
  if (isModelLockActive(c, model)) return false;
  if (isFreebuff && model && freebuffQuotaCache) {
    const cacheMap = freebuffQuotaCache.get(c.id);
    const canonical = canonicalFreebuffModel(model);
    const quota = cacheMap?.[canonical] || cacheMap?.[model];
    if (quota && !quota.unlimited && quota.remaining !== null && quota.remaining <= 0 && quota.resetAt && new Date(quota.resetAt).getTime() > Date.now()) return false;
  }
  return true;
}

/**
 * Proactive model availability probe for combo pre-checks: "does this
 * provider+model have ANY routable account right now?" A fresh selection
 * that finds nothing is an expensive PG scan (multi-window) paid per combo
 * member per request; this probe front-runs it with the same SQL predicate
 * (durable eligibility is the DB's job — `test_status`, `model_locks`,
 * `locked_all_until`, `rate_limited_until` stay the source of truth) plus a
 * short negative memo so an exhausted fleet is not rescanned on every request.
 *
 * Fail-open by design: unknown providers, zero rows (misconfiguration), or
 * probe errors return { available: true } so callers fall through to normal
 * selection and get their accurate NO_CREDENTIALS / classified response.
 *
 * Returns { available: boolean, retryAfter?, retryAfterHuman?, code?, message? }.
 */
const AVAILABILITY_POSITIVE_TTL_S = 15;
const AVAILABILITY_NEGATIVE_TTL_S = 60;
const availabilityMemo = new Map(); // `${providerId}|${model || "*"}` -> memo entry

export function clearAvailabilityMemo(providerId = null, model = null) {
  if (!providerId) {
    availabilityMemo.clear();
    return;
  }
  availabilityMemo.delete(`${providerId}|${model || "*"}`);
}

function memoAvailability(key, verdict) {
  if (availabilityMemo.size > 500) availabilityMemo.clear();
  availabilityMemo.set(key, verdict);
}

function memoVerdictTtl(retryAfter) {
  if (!retryAfter) return AVAILABILITY_NEGATIVE_TTL_S;
  const ms = new Date(retryAfter).getTime() - new Date().getTime();
  if (!Number.isFinite(ms) || ms <= 0) return AVAILABILITY_NEGATIVE_TTL_S;
  return Math.max(5, Math.min(Math.ceil(ms / 1000), AVAILABILITY_NEGATIVE_TTL_S));
}

export async function checkModelAvailability(provider, model) {
  const providerId = resolveProviderId(provider);
  if (FREE_PROVIDERS[providerId]?.noAuth) return { available: true };

  const key = `${providerId}|${model || "*"}`;
  const now = Date.now();
  const memo = availabilityMemo.get(key);
  if (memo && memo.until > now) {
    return memo.verdict === "ok" ? { available: true } : { ...memo.result };
  }

  // Open dead circuit: recent consecutive fresh selections found nothing —
  // skip the PG scan and report the circuit's own retry window.
  const deadCount = typeof getDeadCircuit === "function"
    ? await getDeadCircuit(providerId, model).catch(() => 0)
    : 0;
  if (deadCount >= DEAD_CIRCUIT_THRESHOLD) {
    const retryAfter = new Date(now + DEAD_CIRCUIT_WINDOW_S * 1000).toISOString();
    const result = {
      available: false,
      retryAfter,
      retryAfterHuman: formatRetryAfter(retryAfter),
      code: "PROVIDER_CIRCUIT_OPEN",
      message: `All ${providerId} accounts recently exhausted (circuit) for ${model || "any model"}.`,
    };
    memoAvailability(key, { verdict: "blocked", until: now + DEAD_CIRCUIT_WINDOW_S * 1000, result });
    return result;
  }

  // Provider-wide dead marker (set after a classified all-accounts-blocked
  // selection): every model of this provider is out of accounts.
  if (typeof isProviderDead === "function" && await isProviderDead(providerId).catch(() => false)) {
    const retryAfter = new Date(now + 300 * 1000).toISOString();
    const result = {
      available: false,
      retryAfter,
      retryAfterHuman: formatRetryAfter(retryAfter),
      code: "ACCOUNT_EXHAUSTED",
      message: `All ${providerId} accounts are exhausted or unavailable.`,
    };
    memoAvailability(key, { verdict: "blocked", until: now + 300 * 1000, result });
    return result;
  }

  // Window scan mirroring the selection path (SQL pre-filters durable
  // eligibility: active rows minus exhausted/locked per the routing model).
  const candidateWindow = 100;
  let connections = [];
  for (let windowIdx = 0; windowIdx < 2; windowIdx++) {
    const batch = await getProviderConnections({
      provider: providerId,
      isActive: true,
      routingModel: model,
      limit: candidateWindow,
      offset: windowIdx * candidateWindow,
    }).catch(() => []);
    if (batch.length === 0) break;
    connections = connections.concat(batch);

    let cooledDownIds = new Set();
    if (providerId === "antigravity" && model) {
      try {
        const getSnapshots = getLocalDbFn("getBatchProviderQuotas");
        const snapshots = typeof getSnapshots === "function" ? await getSnapshots(providerId).catch(() => []) : [];
        await hydrateQuotaCacheFromSnapshots(snapshots);
      } catch {}
    }
    const candidateIds = batch.map((c) => c.id);
    const cooldownResult = await getBatchCooldowns(candidateIds, model).catch(() => ({ ids: new Set(), healthy: true }));
    cooledDownIds = cooldownResult?.ids instanceof Set ? cooldownResult.ids : cooldownResult;
    const ctx = {
      excludeSet: new Set(), cooledDownIds,
      model, providerId,
      isAntigravity: providerId === "antigravity",
      isFreebuff: providerId === "freebuff",
      freebuffQuotaCache: providerId === "freebuff" && model ? getFreebuffQuotaCache() : null,
    };
    if (batch.some((c) => isConnectionRoutable(c, ctx))) {
      memoAvailability(key, { verdict: "ok", until: now + AVAILABILITY_POSITIVE_TTL_S * 1000 });
      return { available: true };
    }
  }
  if (connections.length === 0) {
    // Zero active rows: distinguish misconfiguration (provider has no
    // accounts at all) from exhaustion before reporting a verdict.
    // accounts at all) from exhaustion before reporting a verdict.
    const allConnections = await getProviderConnections({ provider: providerId, limit: 500 }).catch(() => []);
    if (allConnections.length === 0) {
      memoAvailability(key, { verdict: "ok", until: now + AVAILABILITY_POSITIVE_TTL_S * 1000 });
      return { available: true };
    }
    const blocked = classifyBlockedCredentials(providerId, model, allConnections);
    if (!blocked) {
      memoAvailability(key, { verdict: "ok", until: now + AVAILABILITY_POSITIVE_TTL_S * 1000 });
      return { available: true };
    }
    const result = {
      available: false,
      retryAfter: blocked.retryAfter || null,
      retryAfterHuman: blocked.retryAfterHuman || null,
      code: blocked.lastErrorCode || "MIXED_BLOCKED",
      message: blocked.lastError || `No usable ${providerId} credentials for ${model || "requested model"}.`,
      statusBreakdown: blocked.statusBreakdown || null,
    };
    const ttl = blocked.retryAfter ? memoVerdictTtl(blocked.retryAfter) : AVAILABILITY_NEGATIVE_TTL_S;
    memoAvailability(key, { verdict: "blocked", until: now + ttl * 1000, result });
    return result;
  }

  const blocked = classifyBlockedCredentials(providerId, model, connections);
  if (!blocked) {
    memoAvailability(key, { verdict: "ok", until: now + AVAILABILITY_POSITIVE_TTL_S * 1000 });
    return { available: true };
  }
  const result = {
    available: false,
    retryAfter: blocked.retryAfter || null,
    retryAfterHuman: blocked.retryAfterHuman || null,
    code: blocked.lastErrorCode || "MIXED_BLOCKED",
    message: blocked.lastError || `No usable ${providerId} credentials for ${model || "requested model"}.`,
    statusBreakdown: blocked.statusBreakdown || null,
  };
  const ttl = blocked.retryAfter ? memoVerdictTtl(blocked.retryAfter) : AVAILABILITY_NEGATIVE_TTL_S;
  memoAvailability(key, { verdict: "blocked", until: now + ttl * 1000, result });
  return result;
}

/**
  * Get provider credentials from localDb
 */
export async function getProviderCredentials(provider, excludeConnectionIds = null, model = null, options = {}) {
  // Normalize to Set for consistent handling
  const excludeSet = excludeConnectionIds instanceof Set
    ? excludeConnectionIds
    : (excludeConnectionIds ? new Set([excludeConnectionIds]) : new Set());
  const preferredConnectionId = options?.preferredConnectionId || null;

  // Resolve alias to provider ID (e.g., "kc" -> "kilocode")
  const providerId = resolveProviderId(provider);
  // Per-provider mutex: concurrency for different providers remains non-blocking
  const currentMutex = selectionMutexes.get(providerId) || Promise.resolve();
  let resolveMutex;
  const nextMutex = new Promise(resolve => { resolveMutex = resolve; });
  selectionMutexes.set(providerId, nextMutex);

  try {
    await currentMutex;
    // Negative-availability pre-check: a fresh selection that just found
    // nothing (exhausted fleet) memoizes the verdict, so the next request
    // skips the whole multi-window PG scan + cooldown batch and reports the
    // same classified shortage immediately. Inside the mutex so concurrent
    // requests for the same pair don't all scan PG at once. Classify-phase
    // detail (statusBreakdown, blocked names) is preserved on the verdict.
    // Skipped while retrying with exclusions (per-account failover inside a
    // member must still scan remaining accounts, not reuse a fleet verdict)
    // and for probe pins (model Test buttons need the honest account verdict).
    if (excludeSet.size === 0 && !preferredConnectionId) {
      const key = `${providerId}|${model || "*"}`;
      const memo = availabilityMemo.get(key);
      if (memo && memo.until > new Date().getTime()) {
        if (memo.verdict === "blocked") {
          bumpRoutingMetric("availabilityMemoHits");
          return { allRateLimited: true, ...memo.result };
        }
        if (memo.verdict === "ok") bumpRoutingMetric("availabilityOkHits");
      }
    }
    // Inject a virtual connection for no-auth free providers (with optional proxy pool or proxy group from settings)
    if (FREE_PROVIDERS[providerId]?.noAuth) {
      // If the synthesized noAuth account was already excluded (failed attempt),
      // there is nothing else to try — signal all-rate-limited so chat.js
      // returns the error immediately instead of looping 5x on the same egress.
      if (excludeSet.has("noauth")) {
        return { allRateLimited: true, lastError: "No-auth provider already attempted from this egress" };
      }
      const settings = await getSettings();
      const override = (settings.providerStrategies || {})[providerId] || {};
      const strategy = override.rotateStrategy || "none";
      const proxyGroup = override.proxyGroup || null;
      let pickedId = override.proxyPoolId || null;
      let poolIds = [];
      let resolvedProxy = null;

      if (proxyGroup) {
        const groupStrategy = strategy !== "none" ? strategy : "smart";
        resolvedProxy = await resolveConnectionProxyConfig(
          {
            proxyGroup,
            proxyRotationStrategy: groupStrategy,
            proxyPoolScope: `${providerId}::${model || "*"}`,
          },
          `noauth-${providerId}`
        );
        if (resolvedProxy?.proxyPoolIds) {
          poolIds = resolvedProxy.proxyPoolIds;
        }
      } else if (strategy !== "none") {
        const allPools = await getProxyPools({ isActive: true });
        poolIds = allPools.filter(p => p.proxyUrl).map(p => p.id);
        // Scope region-aware ("smart") filtering to this provider/model so
        // pools marked unfit here are skipped.
        const scope = `${providerId}::${model || "*"}`;
        pickedId = pickProxyPoolId(poolIds, strategy, providerId, { scope });
        resolvedProxy = await resolveConnectionProxyConfig({ proxyPoolId: pickedId || "" });
      } else if (override.proxyPoolId) {
        poolIds = [override.proxyPoolId];
        resolvedProxy = await resolveConnectionProxyConfig({ proxyPoolId: override.proxyPoolId });
      } else {
        resolvedProxy = await resolveConnectionProxyConfig({});
      }

      // BYOK for noAuth providers with a stored trial/custom key (e.g. llmtech-free).
      // The executor reads credentials.apiKey to override the registry header.
      const customTrialKey = override.trialKey || null;

      return {
        id: "noauth",
        connectionId: "noauth",
        connectionName: "Public",
        isActive: true,
        accessToken: "public",
        ...(customTrialKey ? { apiKey: customTrialKey } : {}),
        providerSpecificData: {
          connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
          connectionProxyUrl: resolvedProxy.connectionProxyUrl,
          connectionNoProxy: resolvedProxy.connectionNoProxy,
          connectionProxyPoolId: resolvedProxy.proxyPoolId || null,
          vercelRelayUrl: resolvedProxy.vercelRelayUrl || "",
          proxyPoolId: resolvedProxy.proxyPoolId || null,
          strictProxy: resolvedProxy.strictProxy === true,
          failClosedProxy: true,
          proxyGroup: proxyGroup || undefined,
          proxyPoolIds: poolIds.length > 0 ? poolIds : (resolvedProxy.proxyPoolIds?.length > 0 ? resolvedProxy.proxyPoolIds : undefined),
          proxyRotationStrategy: strategy,
        },
      };
    }

    // Query a bounded candidate window from PostgreSQL. The previous path
    // loaded every active credential for a provider into memory, which
    // is unsafe for providers with tens of thousands of accounts.
    const candidateWindow = Math.min(Math.max(Number(options.candidateLimit) || 100, 25), 500);
    const settings = await getSettings();
    const providerOverride = (settings.providerStrategies || {})[providerId] || {};

    // 1. Dead provider/model circuit: consecutive fleet-wide empty selections
    // short-circuit to a fast 503 — no PG scan, no rotation budget burned.
    const deadCount = await getDeadCircuit(providerId, model).catch(() => 0);
    if (deadCount >= DEAD_CIRCUIT_THRESHOLD) {
      const retryAfter = new Date(Date.now() + DEAD_CIRCUIT_WINDOW_S * 1000).toISOString();
      log.warn("AUTH", `${providerId} | circuit open (${deadCount}x empty) — fast 503 for ${model || "any"}`);
      bumpRoutingMetric("circuitTrips");
      return {
        allRateLimited: true,
        retryAfter,
        retryAfterHuman: "1m",
        lastError: `All ${providerId} accounts recently exhausted (circuit) — retry shortly.`,
        lastErrorCode: "PROVIDER_CIRCUIT_OPEN",
      };
    }

    // 2. Last-known-good fast path: one proven account skips the whole scan
    // (fast roundtrip: cache GET + single-row PG read + 1-id cooldown
    // batch). Honors exclusions; stale pointers self-heal via delLkg on the
    // error path.
    const lkgId = await getLkg(providerId, model).catch(() => null);
    if (lkgId && !excludeSet.has(lkgId)) {
      try {
        const lkgRow = await localDb.getProviderConnectionById(lkgId).catch(() => null);
        if (lkgRow && lkgRow.provider === providerId) {
          const lkgCool = await getBatchCooldowns([lkgId], model).catch(() => ({ ids: new Set(), healthy: true }));
          const lkgCtx = {
            excludeSet, cooledDownIds: lkgCool?.ids instanceof Set ? lkgCool.ids : lkgCool,
            model, providerId,
            isAntigravity: providerId === "antigravity",
            isFreebuff: providerId === "freebuff",
            freebuffQuotaCache: getFreebuffQuotaCache(),
          };
          if (isConnectionRoutable(lkgRow, lkgCtx)) {
            bumpRoutingMetric("lkgHits");
            log.debug("AUTH", `${providerId} | LKG hit ${lkgId.slice(0, 8)} for ${model || "any"}`);
            if (excludeSet.size === 0) resetDeadCircuit(providerId, model).catch(() => {});
            return finalizeSelection(lkgRow);
          }
          bumpRoutingMetric("lkgStale");
        }
      } catch {}
    }

    // 3. Window scan (up to 2 windows): SQL pre-filters durable eligibility;
    // the second window covers providers whose first `candidateWindow` rows
    // are all transiently filtered (cache cooldowns / RAM quota blocks).
    // Window-0 hits the L2 connection cache (60s TTL, invalidated in Valkey
    // including the ::routing: suffix), so repeated selections for a hot
    // provider/model skip the PG scan. Windows ≥1 always re-read PG.
    const MAX_SELECTION_WINDOWS = Math.min(10, Math.max(2, Number(process.env.ROUTING_MAX_CANDIDATE_WINDOWS) || 6));
    const CONNECTION_CACHE_TTL_S = 60;
    const loadWindow = async (windowIdx) => {
      if (windowIdx === 0) {
        const cached = await getCachedConnections(`${providerId}::routing:${model || "*"}`).catch(() => null);
        if (Array.isArray(cached)) return cached;
      }
      const batch = await getProviderConnections({
        provider: providerId,
        isActive: true,
        routingModel: model,
        excludeIds: [...excludeSet],
        limit: candidateWindow,
        offset: windowIdx * candidateWindow,
      });
      if (windowIdx === 0 && batch.length > 0 && excludeSet.size === 0) {
        setCachedConnections(`${providerId}::routing:${model || "*"}`, batch, CONNECTION_CACHE_TTL_S).catch(() => {});
      }
      return batch;
    };
    const isAntigravity = providerId === "antigravity";
    const isFreebuff = providerId === "freebuff";
    // Antigravity: hydrate the durable quota snapshot cache ONCE, before the
    // window loop — the snapshot set is per-provider, so re-fetching and
    // re-hydrating inside every window duplicated identical PG reads up to
    // MAX_SELECTION_WINDOWS times per selection.
    if (isAntigravity && model) {
      try {
        const getSnapshots = getLocalDbFn("getBatchProviderQuotas");
        const snapshots = typeof getSnapshots === "function" ? await getSnapshots(providerId).catch(() => []) : [];
        await hydrateQuotaCacheFromSnapshots(snapshots);
      } catch {}
    }
    let connections = [];
    let availableConnections = [];
    let cooledDownIds = new Set();
    let cooldownHealthy = true;
    let lastCandidateIds = [];
    for (let windowIdx = 0; windowIdx < MAX_SELECTION_WINDOWS; windowIdx++) {
      const batch = await loadWindow(windowIdx);
      if (batch.length === 0) break;
      connections = connections.concat(batch);
      connections = filterConnectionsForModel(providerId, connections, model, settings);

      const candidateIds = batch.map(c => c.id).filter(id => !excludeSet.has(id));
      lastCandidateIds = candidateIds;
      const cooldownResult = await getBatchCooldowns(candidateIds, model);
      cooledDownIds = cooldownResult?.ids instanceof Set ? cooldownResult.ids : cooldownResult;
      cooldownHealthy = cooldownResult?.healthy !== false;

      const ctx = {
        excludeSet, cooledDownIds, model, providerId,
        isAntigravity, isFreebuff,
        freebuffQuotaCache: isFreebuff && model ? getFreebuffQuotaCache() : null,
      };
      availableConnections = batch.filter(c => isConnectionRoutable(c, ctx));
      if (availableConnections.length > 0) break;
    }

    log.debug("AUTH", `${provider} | total connections: ${connections.length}, excludeIds: ${excludeSet.size > 0 ? [...excludeSet].join(",") : "none"}, model: ${model || "any"}`);
    if (connections.length === 0) {
      // The routing query intentionally asks for active rows only. Inspect
      // all provider rows before reporting "no credentials" so disabled and
      // unavailable accounts are not confused with a missing provider.
      const allConnections = await getProviderConnections({ provider: providerId, limit: 500 });
      const blocked = classifyBlockedCredentials(provider, model, allConnections);
      if (blocked) {
        // Fresh selection that found nothing: memoize so the next request
        // skips the multi-window PG scan (see the memo read above).
        if (excludeSet.size === 0) {
          const ttl = blocked.retryAfter ? memoVerdictTtl(blocked.retryAfter) : AVAILABILITY_NEGATIVE_TTL_S;
          memoAvailability(`${providerId}|${model || "*"}` , {
            verdict: "blocked", until: new Date().getTime() + ttl * 1000,
            result: {
              allRateLimited: true,
              retryAfter: blocked.retryAfter,
              retryAfterHuman: blocked.retryAfterHuman,
              lastError: blocked.lastError,
              lastErrorCode: blocked.lastErrorCode,
              statusBreakdown: blocked.statusBreakdown,
              blockedNames: blocked.blockedNames,
              blockedConnectionIds: blocked.blockedConnectionIds,
            },
          });
        }
        return blocked;
      }
      log.warn("AUTH", `No credentials for ${provider}`);
      // Rows exist but none are routable (and this is a fresh selection):
      // feed the dead-circuit like the filtered-empty path below. A provider
      // with zero rows at all is misconfiguration, not exhaustion — skip it.
      if (excludeSet.size === 0 && allConnections.length > 0) {
        incrDeadCircuit(providerId, model, DEAD_CIRCUIT_WINDOW_S).catch(() => {});
      }
      return null;
    }


    // Freebuff 1-hour dynamic model affinity lock:
    // 1 account can only serve 1 model at a time. If locked to model X, it can only serve model X.
    // Accounts with no active lock can serve any model. Prioritize matching locked accounts.
    if (providerId === "freebuff" && model && availableConnections.length > 0) {
      const now = Date.now();
      const affinityCandidates = availableConnections;
      const matchingLocked = [];
      const unlocked = [];

      for (const c of affinityCandidates) {
        const isLocked = Boolean(
          c.lockedToModel &&
          c.lockedToModelUntil &&
          new Date(c.lockedToModelUntil).getTime() > now
        );

        if (isLocked) {
          if (isSameFreebuffModel(c.lockedToModel, model)) {
            matchingLocked.push(c);
          }
          // Account locked to another model -> excluded!
        } else {
          unlocked.push(c);
        }
      }

      if (matchingLocked.length > 0) {
        // Prioritize accounts already locked to this model to prevent lock fragmentation
        availableConnections = matchingLocked;
      } else if (unlocked.length > 0) {
        // Fall back to clean/unlocked accounts
        availableConnections = unlocked;
      } else {
        // All accounts are currently locked to other models!
        const lockedExpiries = affinityCandidates
          .filter((c) => c.lockedToModel && c.lockedToModelUntil && new Date(c.lockedToModelUntil).getTime() > now)
          .map((c) => c.lockedToModelUntil)
          .sort();
        const earliestExpiry = lockedExpiries[0] || null;
        log.warn("AUTH", `Freebuff | all ${affinityCandidates.length} eligible accounts locked to other models — requested: ${model}`);
        return {
          allRateLimited: true,
          retryAfter: earliestExpiry,
          retryAfterHuman: earliestExpiry ? formatRetryAfter(earliestExpiry) : "1h",
          lastError: `All Freebuff accounts are currently locked to other models. Next session releases in ${earliestExpiry ? formatRetryAfter(earliestExpiry) : "1h"}.`,
          lastErrorCode: "FREEBUFF_MODEL_LOCKED",
        };
      }
    }

    log.debug("AUTH", `${provider} | available: ${availableConnections.length}/${connections.length}`);
    connections.forEach(c => {
      const excluded = excludeSet.has(c.id);
      const locked = isModelLockActive(c, model);
      if (excluded || locked) {
        const lockUntil = getEarliestModelLockUntil(c, model);
        log.debug("AUTH", `  → ${c.id?.slice(0, 8)} | ${excluded ? "excluded" : ""} ${locked ? `modelLocked(${model}) until ${lockUntil}` : ""}`);
      }
    });

    if (availableConnections.length === 0) {
      // Deadlock breaker: snapshot-exhausted accounts are never selected, so
      // they never live-refresh (refresh otherwise happens only on the
      // 409/429 error path) and top-ups stay invisible until a lock lapses or
      // an admin resets. On a fully-blocked Antigravity selection, kick a
      // NEXT request (seconds later) sees fresh quota. refreshQuota already
      // deduplicates in-flight work; this call never awaits — fail-open, zero
      // added latency on this failed selection.
      if (isAntigravity && model) {
        try {
          const reviveRows = connections
            .filter((c) => c?.id && (
              isQuotaMapExhausted(getQuotaCacheEntry(c.id)?.quotas)
              || isAntigravityAccountQuotaExhausted(c.id)
              || isAntigravityModelCacheExhausted(c.id, model)
            ))
            .slice(0, 5);
          for (const row of reviveRows) {
            // HEAD cache owns strike/throttle. Mirror the fresh map into the
            // domain cache so later requests agree. queueMicrotask keeps a
            // throwing mock from rejecting this selection.
            queueMicrotask(() => {
              refreshAntigravityQuota(row.id, row.accessToken, row.providerSpecificData)
                .then((quotas) => {
                  if (quotas) setQuotaCache(row.id, "antigravity", quotas);
                })
                .catch(() => {});
            });
          }
          if (reviveRows.length > 0) {
            log.debug("AG_QUOTA", `${providerId} | fully blocked for ${model} — background revive refresh for ${reviveRows.length} snapshot-exhausted account(s)`);
          }
        } catch {}
      }
      // A cached connection list may be stale. Re-read all rows before
      // classifying the failure so cache cannot hide exhausted/disabled state.
      const stateConnections = await getProviderConnections({ provider: providerId, limit: 500 });
      if (isAntigravity && model) {
        const readQuotas = getLocalDbFn("getBatchProviderQuotas");
        const agSnapshots = readQuotas ? await readQuotas(providerId).catch(() => []) : [];
        await hydrateQuotaCacheFromSnapshots(agSnapshots);
      }
      // Find earliest persistent lock or lazy quota-cache reset for retry timing.
      const lockedConns = stateConnections.filter(c => isModelLockActive(c, model));
      const expiries = lockedConns.map(c => getEarliestModelLockUntil(c, model)).filter(Boolean);
      if (isAntigravity && model) {
        const agCache = getAntigravityQuotaCache();
        stateConnections.forEach((c) => {
          const resetMs = earliestResetAt(getQuotaCacheEntry(c.id)?.quotas);
          if (resetMs && resetMs > new Date().getTime()) expiries.push(new Date(resetMs).toISOString());
          const modelQuota = agCache.get(c.id)?.[String(model).replace(/^(antigravity|agy)\//, "")];
          const modelResetMs = modelQuota?.resetAt ? new Date(modelQuota.resetAt).getTime() : NaN;
          if (Number.isFinite(modelResetMs) && modelResetMs > new Date().getTime()) {
            expiries.push(new Date(modelResetMs).toISOString());
          }
        });
      }
      if (isFreebuff && model && freebuffQuotaCache) {
        stateConnections.forEach((c) => {
          const resetAt = freebuffQuotaCache.get(c.id)?.[model]?.resetAt;
          if (resetAt && new Date(resetAt).getTime() > Date.now()) expiries.push(resetAt);
        });
      }
      const earliest = expiries.sort()[0] || null;
      if (earliest) {
        const earliestConn = lockedConns[0];
        const classified = classifyBlockedCredentials(provider, model, stateConnections);
        log.warn("AUTH", `${provider} | all ${stateConnections.length} accounts locked for ${model || "all"} (${formatRetryAfter(earliest)}) | lastError=${earliestConn?.lastError?.slice(0, 50)}`);
        return {
          allRateLimited: true,
          retryAfter: earliest,
          retryAfterHuman: formatRetryAfter(earliest),
          lastError: classified?.lastError || `Model ${model} is exhausted for all ${provider} accounts.`,
          lastErrorCode: classified?.lastErrorCode || "MODEL_EXHAUSTED",
        };
      }

      const excludedAll = lastCandidateIds.length === 0 && excludeSet.size > 0;
      const blocked = classifyBlockedCredentials(provider, model, stateConnections, {
        cooledDown: cooldownHealthy && !excludedAll && cooledDownIds.size > 0 && cooledDownIds.size >= lastCandidateIds.length,
      });
      if (blocked) {
        if (excludeSet.size === 0) {
          const ttl = blocked.retryAfter ? memoVerdictTtl(blocked.retryAfter) : AVAILABILITY_NEGATIVE_TTL_S;
          memoAvailability(`${providerId}|${model || "*"}` , {
            verdict: "blocked", until: new Date().getTime() + ttl * 1000,
            result: {
              allRateLimited: true,
              retryAfter: blocked.retryAfter,
              retryAfterHuman: blocked.retryAfterHuman,
              lastError: blocked.lastError,
              lastErrorCode: blocked.lastErrorCode,
              statusBreakdown: blocked.statusBreakdown,
              blockedNames: blocked.blockedNames,
              blockedConnectionIds: blocked.blockedConnectionIds,
            },
          });
        }
        return blocked;
      }
      log.warn("AUTH", `${provider} | all ${connections.length} accounts unavailable`);
      // Fleet signal: a FRESH selection (no exclusions) that finds nothing
      // means the provider/model is likely fully dead — count toward the
      // dead-circuit so subsequent requests short-circuit fast.
      if (excludeSet.size === 0) incrDeadCircuit(providerId, model, DEAD_CIRCUIT_WINDOW_S).catch(() => {});
      return null;
    }

    // A routable account exists — the provider/model has capacity; make sure
    // a previously opened dead-circuit is closed.
    if (excludeSet.size === 0) resetDeadCircuit(providerId, model).catch(() => {});

    // Per-provider strategy overrides global setting
    const strategy = providerOverride.fallbackStrategy || settings.fallbackStrategy || "fill-first";

    let connection;
    // Pin to preferred connection if specified and available.
    // Strict pin (model probes): a missed pin is an honest error, never a
    // silent fallback to a sibling account (which would report health for
    // the wrong connection).
    if (preferredConnectionId) {
      connection = availableConnections.find((c) => c.id === preferredConnectionId);
      if (connection) {
        log.info("AUTH", `${provider} | pinned to ${connection.id?.slice(0, 8)} (${connection.name || connection.email || "unnamed"})`);
      } else if (options?.strictPin) {
        log.warn("AUTH", `${provider} | strict pin missed: ${preferredConnectionId.slice(0, 8)} not routable`);
        return {
          pinnedMiss: true,
          connectionId: preferredConnectionId,
          lastError: `Pinned connection ${preferredConnectionId.slice(0, 8)}... is not currently routable (locked, cooling down, or disabled).`,
          lastErrorCode: "PINNED_UNAVAILABLE",
        };
      }
    }
    if (connection) {
      // skip strategy
    } else if (strategy === "round-robin") {
      const stickyLimit = providerOverride.stickyRoundRobinLimit || settings.stickyRoundRobinLimit || 3;

      // Sort by lastUsed (most recent first) to find current candidate
      const byRecency = [...availableConnections].sort((a, b) => {
        if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
        if (!a.lastUsedAt) return 1;
        if (!b.lastUsedAt) return -1;
        return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
      });

      const current = byRecency[0];
      const currentCount = current?.consecutiveUseCount || 0;

      if (current && current.lastUsedAt && currentCount < stickyLimit) {
        // Stay with current account
        connection = current;
        // Fire-and-forget: cheap last_used_at-only UPDATE (no transaction, no
        // row lock, no full-row rewrite) — same durability contract as the
        // fill-first branch. consecutiveUseCount is in-memory only until the
        // account rotates.
        if (connection?.id) {
          try {
            const touch = localDb.touchAccountLastUsed(connection.id);
            if (touch && typeof touch.catch === "function") touch.catch(() => {});
          } catch {}
        }
      } else {
        // Pick the least recently used (excluding current if possible)
        const sortedByOldest = [...availableConnections].sort((a, b) => {
          if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
          if (!a.lastUsedAt) return -1;
          if (!b.lastUsedAt) return 1;
          return new Date(a.lastUsedAt) - new Date(b.lastUsedAt);
        });

        connection = sortedByOldest[0];

        // Fire-and-forget touch (same cheap UPDATE as the sticky branch);
        // persistence of the rotation state rides on last_used_at itself.
        if (connection?.id) {
          try {
            const touch = localDb.touchAccountLastUsed(connection.id);
            if (touch && typeof touch.catch === "function") touch.catch(() => {});
          } catch {}
        }
      }
    } else {
      // Default: fill-first with Top-5 Fair-Share Jitter (Decision #6)
      if (availableConnections.length > 1) {
        // Take top candidates up to 5
        const candidates = availableConnections.slice(0, Math.min(5, availableConnections.length));
        // Pick 1 randomly with jitter
        const pickedIdx = Math.floor(Math.random() * candidates.length);
        connection = candidates[pickedIdx];
      } else {
        connection = availableConnections[0];
      }
      // Fire-and-forget touch last_used_at for fair-share distribution
      if (connection?.id) {
        try {
          const touch = localDb.touchAccountLastUsed(connection.id);
          if (touch && typeof touch.catch === "function") touch.catch(() => {});
        } catch {}
      }
    }

    return finalizeSelection(connection);

    // Single shape builder for the credentials contract (connectionId, tokens,
    // proxy resolution). Both the window scan and the LKG fast path return
    // through here so callers never see a raw DB row. Function declaration
    // (hoisted) because the LKG fast path above uses it before this line.
    async function finalizeSelection(connection) {
    // Scope the region-aware picker to this provider/model (e.g. freebuff::gpt-5.6-luna)
    const hasPoolConfig = connection.providerSpecificData?.proxyPoolIds?.length || connection.providerSpecificData?.proxyGroup;
    const psdForProxy = hasPoolConfig
      ? { ...connection.providerSpecificData, proxyPoolScope: `${providerId}::${model || ""}` }
      : connection.providerSpecificData;
    const resolvedProxy = await resolveConnectionProxyConfig(psdForProxy || {}, connection.id);

    return {
      authType: connection.authType,
      apiKey: connection.apiKey,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      idToken: connection.idToken,
      expiresAt: connection.expiresAt,
      expiresIn: connection.expiresIn,
      lastRefreshAt: connection.lastRefreshAt,
      projectId: connection.projectId,
      connectionName: connection.displayName || connection.name || connection.email || connection.id,
      copilotToken: connection.providerSpecificData?.copilotToken,
      providerSpecificData: {
        ...(connection.providerSpecificData || {}),
        connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
        connectionProxyUrl: resolvedProxy.connectionProxyUrl,
        connectionNoProxy: resolvedProxy.connectionNoProxy,
        connectionProxyPoolId: resolvedProxy.proxyPoolId || null,
        vercelRelayUrl: resolvedProxy.vercelRelayUrl || "",
        proxyPoolId: resolvedProxy.proxyPoolId || null,
        noFitPool: resolvedProxy.noFitPool === true,
        strictProxy: resolvedProxy.strictProxy === true,
      },
      connectionId: connection.id,
      // Include current status for optimization check
      testStatus: connection.testStatus,
      lastError: connection.lastError,
      // Pass full connection for clearAccountError to read modelLock_* keys
      _connection: connection
      };
    }
  } finally {
    if (resolveMutex) resolveMutex();
    if (selectionMutexes.get(providerId) === nextMutex) {
      selectionMutexes.delete(providerId);
    }
  }
}

/**
 * Extract validation URL and message from Antigravity/Google VALIDATION_REQUIRED 403 error.
 * Supports Google RPC ErrorInfo (details[].metadata.validation_url), error.metadata.validation_url,
 * and JSON/regex fallbacks.
 * @param {string|object} errorText
 * @returns {{ url: string, message: string }|null}
 */
export function extractValidationUrl(errorText) {
  if (!errorText) return null;
  const str = typeof errorText === "string" ? errorText : JSON.stringify(errorText);

  if (!/validation_url|validationUrl|VALIDATION_REQUIRED|action_required|verify.*account|verification required/i.test(str)) {
    return null;
  }

  // Deep-search any nesting level for a validation URL key. Google nests it
  // under details[].metadata, error.metadata, or deeper wrappers depending on
  // the surface (Antigravity RPC, Gemini REST, proxy-wrapped bodies) — a
  // fixed-depth lookup silently misses new shapes and leaves a stale URL
  // stored on the account. Two passes: exact validation_url KEYS anywhere in
  // the tree first (a docs URL inside a message string must never shadow the
  // real key), then bare verification-looking URLs in free text.
  const deepFindKeyUrl = (node, depth = 0) => {
    if (!node || depth > 8) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = deepFindKeyUrl(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (/^validation_?url$/i.test(key) && typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
          return value.trim();
        }
      }
      for (const value of Object.values(node)) {
        const found = deepFindKeyUrl(value, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const deepFindUrl = (node, depth = 0) => {
    if (!node || depth > 8) return null;
    if (typeof node === "string") {
      const m = node.match(/https?:\/\/[^\s"'<>\\]+/i);
      return m ? m[0] : null;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = deepFindUrl(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof node === "object") {
      for (const value of Object.values(node)) {
        const found = deepFindUrl(value, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  // Message for the dashboard badge (first human-readable message found).
  const deepFindMessage = (node, depth = 0) => {
    if (!node || depth > 6) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = deepFindMessage(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof node === "object") {
      if (typeof node.message === "string" && node.message.trim()) return node.message.trim();
      if (typeof node.msg === "string" && node.msg.trim()) return node.msg.trim();
      for (const value of Object.values(node)) {
        const found = deepFindMessage(value, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  try {
    const jsonStart = str.indexOf("{");
    if (jsonStart !== -1) {
      const parsed = JSON.parse(str.slice(jsonStart));
      const errorObj = parsed.error || parsed;
      const url = deepFindKeyUrl(errorObj) || deepFindUrl(errorObj);
      if (url) {
        return {
          url,
          message: deepFindMessage(errorObj) || "Verification required by Google",
        };
      }
    }
  } catch {
    // JSON parse failed, fallback to regex below
  }

  const urlMatch = str.match(/(?:validation_url|validationUrl)["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+)["']/i);
  if (urlMatch && urlMatch[1]) {
    const msgMatch = str.match(/"message"\s*:\s*"([^"]+)"/i);
    return {
      url: urlMatch[1].trim(),
      message: msgMatch ? msgMatch[1].trim() : "Verification required by Google",
    };
  }

  // Last resort: bare actionable URL inside a human message. The gate above
  // already proved action-required markers exist in the text, so the markers
  // live around the URL, not necessarily inside it — real Google links look
  // like accounts.google.com/signin/continue?... with no "verify" in the URL
  // itself. Prefer sign-in/auth/verify hosts, else take the first URL.
  const allUrls = [...str.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)].map((m) => m[0].trim());
  const actionable = allUrls.find((u) => /accounts\.google\.|signin|oauth|auth|verif|valid|challenge|confirm|validate/i.test(u));
  if (actionable || allUrls.length > 0) {
    return { url: (actionable || allUrls[0]).trim(), message: "Verification required by Google" };
  }

  return null;
}

/**
 * Mark account+model as unavailable — locks modelLock_${model} in DB.
 * All errors (429, 401, 5xx, etc.) lock per model, not per account.
 * @param {string} connectionId
 * @param {number} status - HTTP status code from upstream
 * @param {string} errorText
 * @param {string|null} provider
 * @param {string|null} model - The specific model that triggered the error
 * @param {number|null} resetsAtMs - Precise upstream reset time when known
 * @param {string} [freebuffKind] - Freebuff gate kind: "banned" | "country_blocked" | "free_mode_unavailable"
 * @returns {{ shouldFallback: boolean, cooldownMs: number }}
 */
export async function markAccountUnavailable(connectionId, status, errorText, provider = null, model = null, resetsAtMs = null, freebuffKind = null, rawBody = null) {
  if (!connectionId || connectionId === "noauth") return { shouldFallback: false, cooldownMs: 0 };
  // Client abort / disconnect (499) must never lock accounts or models
  if (status === 499 || /request aborted|client closed|client disconnected/i.test(String(errorText || ""))) {
    return { shouldFallback: false, cooldownMs: 0 };
  }
  // Single-row read: only backoffLevel/status/proxy data of THIS connection
  // is consumed below. The old fleet-wide getProviderConnections({ provider })
  // load pulled every row + parsed jsonb data just to .find() one id — a
  // per-error PG tax that amplified every upstream error storm.
  const conn = await localDb.getProviderConnectionById(connectionId).catch(() => null);
  const backoffLevel = conn?.backoffLevel || 0;

  // A Freebuff proxy-egress refusal (free_mode_unavailable / anonymous_network)
  // is NOT an account fault — the pool already rotated in chatCore, so just
  // fall back to the next account with zero cooldown. Must stay BEFORE the
  // banned check so the bare "banned" substring rules can never touch it.
  const providerIdEarly = resolveProviderId(provider);
  const freebuffProxyRefusal = providerIdEarly === "freebuff"
    && (freebuffKind === "free_mode_unavailable"
      || /free_mode_unavailable|anonymous_network|rotating proxy/i.test(String(errorText || "")));
  if (freebuffProxyRefusal) {
    // The proxy egress was refused, but the account itself may still be
    // banned upstream — the refusal masks it. Verify via direct egress
    // (GET /session, no quota burned) so a truly banned account gets
    // disabled immediately instead of cycling through fallback forever.
    if (conn) {
      const accessToken = conn.accessToken || null;
      verifyFreebuffAccountDirect(accessToken).then((verdict) => {
        if (verdict !== "banned") return;
        const connName = conn.displayName || conn.name || conn.email || connectionId.slice(0, 8);
        const reason = `Freebuff account "${connName}" banned (403, verified via direct egress after proxy refusal): {"status":"banned"}`;
        updateProviderConnection(connectionId, {
          isActive: false,
          testStatus: "disabled",
          previousStatus: conn?.testStatus || "active",
          disabledReason: reason,
          disabledAt: new Date().toISOString(),
          disabledBy: "system",
          lastError: reason,
          errorCode: 403,
          lastErrorAt: new Date().toISOString(),
          backoffLevel: 0,
          modelLock___all: null,
          modelLocks: {},
          lockedAllUntil: null,
          lockedToModel: null,
          lockedToModelUntil: null,
          rateLimitedUntil: null,
        }).then(() => {
          invalidateCachedConnections(providerIdEarly).catch(() => {});
          cacheSetAccountCooldown(connectionId, 7 * 24 * 3600).catch(() => {});
          log.warn("AUTH", `${connName} Freebuff account banned (verified direct) — DISABLED (is_active=false), removed from routing`);
        }).catch((e) => {
          log.warn("AUTH", `Failed to disable banned Freebuff account ${connName}:`, e);
        });
      }).catch(() => {});
    }
    return { shouldFallback: true, cooldownMs: 0 };
  }

  // Freebuff limited IP tier (rate limited on proxy IP, e.g. Freebucks 25/25 limit)
  // is NOT an account fault — set 30s cache cooldown only, do NOT lock model in DB.
  const freebuffLimitedIp = providerIdEarly === "freebuff"
    && (freebuffKind === "limited_ip"
      || /accesstier["']?\s*:\s*["']?limited|pool["']?\s*:\s*["']?freebucks|limited-tier|limited_ip/i.test(String(errorText || "")));
  if (freebuffLimitedIp) {
    if (model) {
      cacheSetModelCooldown(connectionId, model, 30).catch(() => {});
    }
    const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
    log.warn("AUTH", `${connName} Freebuff limited IP tier (proxy-bound) — setting 30s in-memory cooldown for ${model || "all"} (no DB model lock)`);
    return { shouldFallback: true, cooldownMs: 30000 };
  }

  // A Freebuff account the backend reports as banned is permanently dead:
  // take it out of routing entirely (is_active=false, status disabled) rather
  // than a timed cooldown that would re-select it after the window lapses.
  // country_blocked is NOT an account fault — the proxy/region is blocked — so
  // it must never disable the account here; it falls through to the generic
  // path and the short-cooldown country rules in ERROR_RULES.
  const providerId = resolveProviderId(provider);
  const freebuffBanned = providerId === "freebuff"
    && (freebuffKind === "banned" || /(^|[^a-z])banned([^a-z]|$)/i.test(String(errorText || "")));
  if (freebuffBanned) {
    const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
    const rawReason = typeof errorText === "string" ? errorText : (errorText ? String(errorText) : "Freebuff account banned");
    const reason = rawReason.includes(connName) ? rawReason : `Freebuff account "${connName}" banned (403): ${rawReason}`;
    await updateProviderConnection(connectionId, {
      isActive: false,
      testStatus: "disabled",
      previousStatus: conn?.testStatus || "active",
      disabledReason: reason,
      disabledAt: new Date().toISOString(),
      disabledBy: "system",
      errorCode: status || 403,
      lastErrorAt: new Date().toISOString(),
      backoffLevel: 0,
      modelLock___all: null,
      modelLocks: {},
      lockedAllUntil: null,
      lockedToModel: null,
      lockedToModelUntil: null,
      rateLimitedUntil: null,
    });
    await invalidateCachedConnections(providerId).catch(() => {});
    // Long L2 cooldown so the speed-layer cache also stops returning it.
    cacheSetAccountCooldown(connectionId, 7 * 24 * 3600).catch(() => {});
    log.warn("AUTH", `${connName} Freebuff account banned — DISABLED (is_active=false), removed from routing`);
    console.error(`❌ ${provider} [${status}]: ${reason}`);
    return { shouldFallback: true, cooldownMs: 0 };
  }

  // GitHub premium-request exhaustion is account-wide until the next UTC month.
  const githubResetAtMs = githubMonthlyResetMs(status, errorText, provider);
  const is524Timeout = status === 524 || /524|gateway timeout|timeout occurred/i.test(String(errorText || ""));

  // Providers whose quota/credits are account-wide across ALL models
  // Cline-free free tier: all models share a single daily request budget
  const POOLED_QUOTA_PROVIDERS = new Set(["codex", "codebuddy-cn", "codebuddy-intl", "workbuddy", "github", "grok-cli", "cline-free"]);
  const isPooledQuotaProvider = POOLED_QUOTA_PROVIDERS.has(providerId);

  // Provider-specific precise cooldown (e.g. codex usage_limit_reached resets_at, antigravity quotaResetTimeStamp) overrides backoff
  let shouldFallback, cooldownMs, newBackoffLevel, lockAll = false, disableAccount = false, isExhausted = false, frequencyLimitReset = false, isToolIncompatibility = false;
  const cfResetAtMs = cloudflareDailyResetMs(status, errorText, provider);
  if (cfResetAtMs) {
    shouldFallback = true;
    cooldownMs = cfResetAtMs - Date.now();
    newBackoffLevel = 0;
    lockAll = true;
    isExhausted = true;
  } else if (githubResetAtMs) {
    shouldFallback = true;
    cooldownMs = githubResetAtMs - Date.now();
    newBackoffLevel = 0;
    lockAll = true;
  } else if (resetsAtMs && resetsAtMs > Date.now()) {
    shouldFallback = true;
    const resolvedProv = resolveProviderId(provider);
    const maxAllowedCooldown = resolvedProv === "antigravity"
      ? 24 * 60 * 60 * 1000
      : (resolvedProv === "freebuff" ? 26 * 60 * 60 * 1000 : MAX_RATE_LIMIT_COOLDOWN_MS);
    cooldownMs = Math.min(resetsAtMs - Date.now(), maxAllowedCooldown);
    newBackoffLevel = 0;
    // Explicit frequency-limit reset ("usage exceeds frequency limit, ...
    // usage will reset at <time>, ... switch to the other models") is a
    // per-model throttle with a precise wake time — never account-wide, even
    // on pooled-quota providers. The frequencyLimit flag also keeps the
    // isCodebuddyThrottle daily-cap rule below from re-locking all models.
    const isFrequencyLimitReset = /usage exceeds frequency limit|exceeds.*frequency limit|frequency.?limit/i.test(String(errorText || ""));
    frequencyLimitReset = isFrequencyLimitReset;
    if (isPooledQuotaProvider && !isFrequencyLimitReset) lockAll = true;
  } else {
    ({ shouldFallback, cooldownMs, newBackoffLevel, lockAll, disableAccount, isExhausted, isToolIncompatibility } = checkFallbackError(status, errorText, backoffLevel));
    if (isPooledQuotaProvider && providerId !== "cline-free" && (status === 429 || (status === 402 && providerId !== "github"))) lockAll = true;
    // UniKey 预扣费额度失败: saldo di pesan. <100 → lock 30d, >=100 → cooldown 1d (bisa top-up / pakai model murah)
    if (providerId === "unikey" && /预扣费额度失败|insufficient_user_quota/i.test(String(errorText || ""))) {
      const m = String(errorText).match(/剩余额度:\s*Credits\s*([\d.]+)/i);
      const balance = m ? parseFloat(m[1]) : NaN;
      if (!Number.isNaN(balance)) {
        if (balance < 100) {
          // saldo tipis → lock monthly (akun hampir kosong)
          cooldownMs = 30 * 24 * 60 * 60 * 1000;
          lockAll = true; isExhausted = true; shouldFallback = true;
        } else {
          // saldo masih ada → cuma cooldown 1 hari, tetap fallback cari akun lain
          cooldownMs = 24 * 60 * 60 * 1000;
          lockAll = true; isExhausted = false; shouldFallback = true;
        }
      }
    }
  }

  // A model-scoped 429 is a model exhaustion, not an account exhaustion. Keep
  // the account active so it can still serve other models. Only account-wide
  // quota locks receive testStatus=exhausted.
  if (status === 429 && !is524Timeout) {
    const lowerErrorText = String(errorText || "").toLowerCase();
    // Daily/individual quota exhaustion → lock ALL models on this account.
    // OpenCode Zen is exempt: its "Rate limit exceeded" wrapper never names a
    // window, so treating it as daily-cap locked every model on the account
    // (big-pickle outage). Zen rate limits are always model-scoped.
    const isZen429 = providerId === "opencode-zen";
    // CodeBuddy/Workbuddy throttle: 14003 "too many requests" = transient,
    // 2-minute model cooldown only. Never account exhausted.
    const isCodebuddyThrottle = (providerId === "codebuddy-cn" || providerId === "codebuddy-intl" || providerId === "workbuddy")
      && /too many requests|rate.?limit exceeded|rate limited|usage exceeds frequency limit/i.test(lowerErrorText)
      && !/quota|credit|exhaust|deplet|balance|payment|billing/i.test(lowerErrorText);
    if (isCodebuddyThrottle) {
      lockAll = false;
      disableAccount = false;
      isExhausted = false;
      shouldFallback = true;
      // CodeBuddy/Workbuddy only: 2-minute model cooldown. Other providers keep
      // the global default (DEFAULT_RATE_LIMIT_COOLDOWN_MS via errorConfig rules).
      cooldownMs = 2 * 60 * 1000;
    }
    // B.ai (aggregator) rate throttle: 429001 "The request rate exceeds the
    // current model TPM/RPM limit ..." is a transient per-model cap (the
    // upstream window is seconds, not a quota). 2-minute model cooldown only —
    // never account-wide, never exhausted, so other models keep serving.
    // Same shape as the CodeBuddy 14003 rule above.
    const isBaiThrottle = providerId === "bai"
      && (/exceeds the current model (tpm|rpm) limit/i.test(lowerErrorText)
        || /(^|[^a-z])429001([^0-9]|$)/.test(lowerErrorText)
        || /too many requests|rate.?limit exceeded|rate limited/i.test(lowerErrorText))
      && !/quota|credit|exhaust|deplet|balance|payment|billing/i.test(lowerErrorText);
    if (isBaiThrottle) {
      lockAll = false;
      disableAccount = false;
      isExhausted = false;
      shouldFallback = true;
      cooldownMs = 2 * 60 * 1000;
    }
    // Cline / Cline-Free transient throttle: 429 "too many requests" / "rate limit exceeded"
    // on a free model is a transient per-model cap (upstream pool, e.g. Laguna / Gemma / GLM).
    // 2-minute model cooldown only — never account-wide, never exhausted, so other free
    // models keep serving. Only explicit "daily free limit" locks the account.
    const isClineFreeThrottle = (providerId === "cline-free" || providerId === "cline")
      && /too many requests|rate.?limit exceeded|rate limited|usage exceeds frequency limit/i.test(lowerErrorText)
      && !/daily free limit|daily.*limit|free.*limit reached/i.test(lowerErrorText);
    if (isClineFreeThrottle) {
      lockAll = false;
      disableAccount = false;
      isExhausted = false;
      shouldFallback = true;
      cooldownMs = 2 * 60 * 1000;
    }
    // CodeBuddy/Workbuddy 14018 "Credits exhausted" = spending pool empty for
    // ALL models on this account. Account exhausted, retry in 7 days.
    // (Lock stays account-wide so other models don't burn rotation budget.)
    const isCodebuddyCreditExhausted = (providerId === "codebuddy-cn" || providerId === "codebuddy-intl" || providerId === "workbuddy")
      && /credits exhausted|insufficient credits/i.test(lowerErrorText);
    if (isCodebuddyCreditExhausted) {
      lockAll = true;
      disableAccount = false;
      isExhausted = true;
      shouldFallback = true;
      cooldownMs = 7 * 24 * 60 * 60 * 1000;
    }

    const isGrokCliDailyRolling429 = providerId === "grok-cli" && /used all the included free usage|rolling 24-hour window/i.test(lowerErrorText);
    const isModelDailyLimit = !isGrokCliDailyRolling429 && Boolean(model) && !isPooledQuotaProvider && /limit reached on model|daily.*limit reached on model|daily limit reached for model|limit_rpd|credits don't affect this cap/i.test(lowerErrorText);
    const isDailyCap429 = isGrokCliDailyRolling429 || (!isModelDailyLimit && !isZen429 && !isCodebuddyThrottle && !isCodebuddyCreditExhausted && !isBaiThrottle && !isClineFreeThrottle && /daily|limit reached|try again in \d+h|individual quota|exhausted.*capacity|quota.*r[e\i]set|quota.*reset/i.test(lowerErrorText));
    if (isDailyCap429) {
      lockAll = true;
      if (isGrokCliDailyRolling429) {
        cooldownMs = 24 * 60 * 60 * 1000;
      }
    } else if (isModelDailyLimit) {
      lockAll = false;
      shouldFallback = true;
    }
    // Every 429 must be cooled down. If the provider did not return a usable
    // reset timestamp, use the stable default instead of the short exponential
    // backoff that causes the same exhausted account to be retried repeatedly.
    // A matched daily-cap rule already carries its own conservative cooldown
    // (24h): keep the larger of the two when no precise reset time exists, so
    // e.g. a Cline daily cap with no "Try again in" hint does not retry-storm
    // every 30 minutes against an 8-24h upstream reset window.
    // CodeBuddy/Workbuddy carry their own explicit cooldowns above (2-min model
    // throttle, 7-day credit exhaustion), as does the B.ai 2-min TPM throttle —
    // never overwrite them with the 30-min default.
    // isDailyCap429 keeps max() semantics (larger of rule/default).
    const resolvedProv = resolveProviderId(provider);
    const maxAllowedCooldown = resolvedProv === "antigravity" ? 24 * 60 * 60 * 1000 : MAX_RATE_LIMIT_COOLDOWN_MS;
    cooldownMs = resetsAtMs && resetsAtMs > Date.now()
      ? Math.min(resetsAtMs - Date.now(), maxAllowedCooldown)
      : isCodebuddyThrottle || isCodebuddyCreditExhausted || isBaiThrottle || isClineFreeThrottle
        ? (cooldownMs || 0)
        : Math.max(DEFAULT_RATE_LIMIT_COOLDOWN_MS, isDailyCap429 ? (cooldownMs || 0) : 0);
    // Exhausted means credits/quota are actually gone — never a bare
    // throttle. A 429 without quota/credit words (pure rate limit, daily cap
    // without credit wording) rides a timed lock as "unavailable" instead, so
    // it recovers and never pollutes the exhausted fleet signal.
    const isCreditQuota429 = isGrokCliDailyRolling429 || /credit|balance|insufficient|exhaust|deplet|billing|payment|quota|allocation|neurons|预扣费额度失败|剩余额度|额度不足/i.test(lowerErrorText);
    const isAccountWideLock = Boolean(lockAll);
    isExhausted = lockAll && isAccountWideLock && (isCreditQuota429 || isCodebuddyCreditExhausted);
    if (isGrokCliDailyRolling429) {
      cooldownMs = 24 * 60 * 60 * 1000;
    }
  }
  // Provider circuit breaker: repeated 5xx storms (systematic upstream
  // outage) open a 10-minute provider-wide circuit so rotation stops
  // burning every account. Per-account quota locks (429/402/403) are normal
  // fleet rotation and must never count toward the circuit breaker.
  if (Number(status) >= 500 && providerId) {
    const cbFails = await incrModelFailCount(`provcircuit:${providerId}`, 300);
    if (cbFails >= 25) {
      await setProviderDead(providerId, 600);
      log.error("AUTH", `Provider circuit opened for ${providerId}: ${cbFails} upstream 5xx failures in 5m`);
    }
  }

  // Antigravity quota snapshots cover the whole account. Once every tracked
  // non-image bucket is exhausted, expose the account as exhausted instead of
  // leaving it merely model-locked and repeatedly selecting it later.
  if (providerId === "antigravity" && resetsAtMs && isQuotaMapExhausted(getQuotaCacheEntry(connectionId)?.quotas)) {
    lockAll = true;
    isExhausted = true;
  }
  if (is524Timeout) {
    lockAll = false;
    disableAccount = false;
    cooldownMs = Math.min(cooldownMs || 0, 5 * 60 * 1000);
    newBackoffLevel = 0;
  }
  // Model-level restrictions (e.g. OpenRouter free model agentic harness gate,
  // or error message explicitly references the model or model restriction) must
  // NEVER lock the entire account — only lock the specific model!
  const lowerErr = String(errorText || "").toLowerCase();
  const opencodeZenCredentialInvalid = providerId === "opencode-zen"
    && /invalid[_ ](?:api[_ ]key|token|credential)|api key[^\n]{0,40}invalid|invalid[^\n]{0,40}api key|revoked|invalid_grant|unauthenticated/i.test(lowerErr);
  const opencodeZenModelOnlyError = providerId === "opencode-zen" && !opencodeZenCredentialInvalid;
  const modelShortName = model ? (model.split("/").pop() || "").toLowerCase() : "";
  const isModelSpecificRestriction = Boolean(
    model &&
    !isPooledQuotaProvider &&
    !isFatalAuthError(status, errorText) &&
    (
      (modelShortName && lowerErr.includes(modelShortName)) ||
      lowerErr.includes(model.toLowerCase()) ||
      /agentic harness|routing_funnel|failed_routing_step|only available|not supported for|upgrade to access|model not supported|model is restricted|endpoint is not available|gate free endpoints/i.test(lowerErr)
    )
  );

  // OpenRouter shared-pool rate limits (is_byok:false, upstream_provider_shared_pool)
  // are per-model, never per-account. This matches poolside/laguna:free 429s.
  const isOpenRouterSharedPool429 = providerId === "openrouter"
    && status === 429
    && /is_byok["']?\s*:\s*false|shared_pool|temporarily rate-limited upstream/i.test(lowerErr);
  if (isOpenRouterSharedPool429) {
    lockAll = false;
    disableAccount = false;
    isExhausted = false;
    shouldFallback = true;
    cooldownMs = Math.max(cooldownMs || 0, Math.min(DEFAULT_RATE_LIMIT_COOLDOWN_MS, 60 * 1000));
  }

  // OpenCode free-tier gate: per-egress/session rejection (not per-account).
  // The next request from a different IP or fresh session will succeed.
  // Never lock account, never lock model — just let the request fall through.
  const isOpenCodeFreeGate = providerId === "opencode"
    && /free tier can only be used from within|free_mode_unavailable|anonymous[_ -]?network|proxy[_ -]?traffic/i.test(lowerErr);
  if (isOpenCodeFreeGate) {
    lockAll = false;
    disableAccount = false;
    isExhausted = false;
    shouldFallback = true;
    cooldownMs = 0;
  }

  // OpenCode Zen must keep the API-key connection routable for free models.
  // Its paid-model billing/entitlement failures are model-scoped, even when
  // the upstream uses HTTP 401. Only an explicitly invalid/revoked key may
  // disable the connection.
  if (opencodeZenModelOnlyError) {
    lockAll = false;
    disableAccount = false;
    isExhausted = false;
    shouldFallback = true;
    // 401 No payment method = model permanently unavailable until upstream billing fixed.
    // Lock 30 days. Other OCZ errors (temporary quota) use standard cooldown.
    const isOczPaymentError = status === 401
      && /no payment method|payment method|billing|add a payment/i.test(lowerErr);
    const oczLockMs = isOczPaymentError
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : Math.max(ANTIGRAVITY_MODEL_LOCK_MS, resetsAtMs && resetsAtMs > Date.now()
        ? resetsAtMs - Date.now()
        : DEFAULT_RATE_LIMIT_COOLDOWN_MS);
    cooldownMs = Math.max(oczLockMs, cooldownMs || 0);
  }

  // Cline Free: "credits exhausted" / "insufficient credits" / "out of credits" means the
  // requested model requires paid credits (the account has no paid balance).
  // Free models on cline-free (glm-5.3-flash, gemma, nemotron, etc.) do NOT consume credits
  // and must stay active. Lock ONLY this model for 30 days, never the whole account!
  // Account-wide exhaustion on cline-free is triggered strictly by "daily free limit".
  const isClineFreePaidModel = providerId === "cline-free"
    && (status === 402 || /credits exhausted|insufficient credits|out of credits|insufficient balance|unavailable for free/i.test(lowerErr));
  if (isClineFreePaidModel) {
    lockAll = false;
    disableAccount = false;
    isExhausted = false;
    shouldFallback = true;
    cooldownMs = 30 * 24 * 60 * 60 * 1000;
  }

  // Cline Free: Per-model rate limit / daily free limit / upstream pool overload
  // locks ONLY that specific model, never the entire account!
  const isClineFreeModelDailyLimit = providerId === "cline-free"
    && model
    && (/daily free limit reached on model|limit reached on model|daily limit reached for|limit_rpd/i.test(lowerErr)
      || (/status 429|rate-limited upstream|rate.?limit exceeded|too many requests|overloaded/i.test(lowerErr) && (status === 429 || status === 500)));
  if (isClineFreeModelDailyLimit) {
    lockAll = false;
    disableAccount = false;
    isExhausted = false;
    shouldFallback = true;
    cooldownMs = resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : (/daily.*limit|limit.*reached/i.test(lowerErr) ? 24 * 60 * 60 * 1000 : 2 * 60 * 1000);
  }
  // TokenHarbor: Free allowance exhausted (rolling 7-day period)
  const isTokenHarborFreeExhausted = providerId === "tokenharbor"
    && (/used this period's free allowance|free allowance/i.test(lowerErr) || (status === 402 && /balance is at \$0/i.test(lowerErr)));
  if (isTokenHarborFreeExhausted) {
    lockAll = true;
    isExhausted = true;
    shouldFallback = true;
    cooldownMs = resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : 7 * 24 * 60 * 60 * 1000;
  }
  const isQuotaExhausted = /resource.*exhausted|quota.*exhausted|exhausted.*capacity|capacity.*exhausted|quota.*reset|daily.*limit|limit reached/i.test(lowerErr);
  if (providerId === "antigravity" && isQuotaExhausted && model) {
    // A model quota error is always a durable model lock, even when the
    // upstream was wrapped in HTTP 502 or the generic fallback classifier
    // treated it as a transient 5xx.
    lockAll = false;
    shouldFallback = true;
    isExhausted = isQuotaMapExhausted(getQuotaCacheEntry(connectionId)?.quotas);
    newBackoffLevel = 0;
    cooldownMs = Math.max(ANTIGRAVITY_MODEL_LOCK_MS, resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS);
  }

  if (isModelSpecificRestriction && status !== 429) {
    lockAll = false;
    disableAccount = false;
  }

  const COOLDOWN_LONG_MS = 2 * 60 * 1000; // aligned with errorConfig COOLDOWN.long
  if (isToolIncompatibility) {
    lockAll = false;
    disableAccount = false;
    isExhausted = false;
    shouldFallback = true;
    newBackoffLevel = 0;
    cooldownMs = Math.min(cooldownMs || 0, COOLDOWN_LONG_MS);
  }

  // Antigravity uses 409 for quota/capacity exhaustion. Keep this provider-
  // specific so generic 409 conflicts remain terminal elsewhere.
  if (providerId === "antigravity" && status === 409) {
    const agQuota409 = /quota|capacity|resource exhausted|exhausted|rate.?limit|try again/i.test(lowerErr);
    if (agQuota409 || (resetsAtMs && resetsAtMs > Date.now())) {
      shouldFallback = true;
      cooldownMs = Math.max(ANTIGRAVITY_MODEL_LOCK_MS, resetsAtMs ? resetsAtMs - Date.now() : DEFAULT_RATE_LIMIT_COOLDOWN_MS);
      lockAll = false;
    }
  }

  // Distributor "no available channel" (e.g. UniKey new_api distributor returns
  // HTTP 503 code model_not_found when no backend channel serves the model).
  // The model ID exists but the distributor is temporarily out of capacity —
  // NOT a dead account. Lock the model with a stable cooldown, fall back
  // immediately, and never disable the account. Without this, the generic
  // transient-5xx cooldown (seconds) hot-loops every account against a dead
  // channel.
  if (model && /no available channel|no healthy channel|all channels .* (busy|failed|unavailable|exhausted)|no channel .* available/i.test(lowerErr)) {
    shouldFallback = true;
    lockAll = false;
    disableAccount = false;
    isExhausted = false;
    newBackoffLevel = 0;
    cooldownMs = Math.max(cooldownMs || 0, resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS);
  }

  // A quota snapshot can prove account-wide exhaustion even when the current
  // error names only one model. Re-read the hydrated snapshot after handling
  // the upstream signal so the durable connection status reflects reality.
  // But the snapshot alone never convicts: the CURRENT error must be
  // quota-family (429/409/402 or quota/credit wording). A transient 5xx or a
  // request-level 4xx on an account with a stale snapshot is a short model
  // lock, never account exhaustion — exhausted means credits/quota are
  // actually gone.
  const readSnapshot = getLocalDbFn("getUsageSnapshotByConnectionId");
  const durableSnapshot = providerId === "antigravity" && readSnapshot
    ? await readSnapshot(connectionId).catch(() => null)
    : null;
  const isQuotaFamilyError = status === 429 || status === 409 || status === 402
    || /quota|exhaust|deplet|insufficient|credit|balance|billing|payment|capacity|rate.?limit|too many requests|try again/i.test(lowerErr);
  if (providerId === "antigravity" && isQuotaFamilyError && (isQuotaMapExhausted(getQuotaCacheEntry(connectionId)?.quotas) || isQuotaMapExhausted(durableSnapshot?.quotas))) {
    lockAll = true;
    isExhausted = true;
    shouldFallback = true;
    const agExhaustedReset = resetsAtMs && resetsAtMs > Date.now() ? resetsAtMs - Date.now() : DEFAULT_RATE_LIMIT_COOLDOWN_MS;
    cooldownMs = Math.max(1000, Math.min(agExhaustedReset, 24 * 60 * 60 * 1000));
  }

  // A positive quota snapshot cannot prove that an arbitrary requested model
  // is usable. A quota/capacity error for that model is therefore always a
  // durable 24-hour model lock, while account-wide exhaustion remains distinct.
  // Respect exact upstream resetsAtMs when known; otherwise use standard 24-hour model lock.
  if (providerId === "antigravity" && isQuotaExhausted && model && !isExhausted) {
    lockAll = false;
    shouldFallback = true;
    const rawCooldown = resetsAtMs && resetsAtMs > Date.now()
      ? resetsAtMs - Date.now()
      : Math.max(ANTIGRAVITY_MODEL_LOCK_MS, cooldownMs || 0);
    cooldownMs = Math.min(rawCooldown, 24 * 60 * 60 * 1000);
  }
  // WorkBuddy/CodeBuddy 403 insufficient_quota (code 11140) = credit/quota
  // exhaustion. Same treatment as 429 credit exhaustion: lock account-wide
  // for 7 days, never disable. Without this the 403 falls through to generic
  // retry — the account keeps being selected, retried, and burns rotation
  // budget on a permanently failed account.
  // NOTE: code 11140 is shared — it also wraps content-filter refusals
  // ("request illegal" + safety review displayMsg). Those are request-level
  // (the prompt was blocked), never an account fault: locking here poisons
  // the whole fleet one account per rotation (each retry hits the same
  // block on the next account). Safety content always wins over the code.
  const isWbSafetyReview = /safety review|request illegal|did not pass the safety review|content filter/i.test(lowerErr);
  const isWbInsufficientQuota = status === 403
    && (providerId === "workbuddy" || providerId === "codebuddy-cn" || providerId === "codebuddy-intl")
    && /insufficient_quota|code.*11140/i.test(lowerErr)
    && !isWbSafetyReview;
  if (isWbInsufficientQuota) {
    lockAll = true;
    disableAccount = false;
    isExhausted = true;
    shouldFallback = true;
    cooldownMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  // Fatal auth/account failure: permanently disable connection from routing
  const candidateText = [rawBody, errorText].filter(Boolean).map(v => typeof v === "string" ? v : JSON.stringify(v)).join("\n");
  const validationData = extractValidationUrl(candidateText);
  if (validationData) {
    disableAccount = true;
  }
  const isOAuthWithRefreshToken = Boolean(
    (conn?.authType === "oauth" || conn?.refreshToken) &&
    !isRefreshBlockedMarker(conn) &&
    !conn?.providerSpecificData?.refreshBlocked
  );
  const fatal = isFatalAuthError(status, candidateText);
  const shouldDisable = Boolean(
    disableAccount ||
    (fatal && !(isOAuthWithRefreshToken && status === 401))
  );
  if (shouldDisable && !opencodeZenModelOnlyError) {
    const reason = typeof errorText === "string" ? errorText : (errorText ? String(errorText) : "Account authentication fatal error");
    await updateProviderConnection(connectionId, {
      isActive: false,
      testStatus: "disabled",
      previousStatus: conn?.testStatus || "active",
      disabledReason: reason,
      disabledAt: new Date().toISOString(),
      disabledBy: "system",
      errorCode: status,
      lastErrorAt: new Date().toISOString(),
      backoffLevel: 0,
      modelLock___all: null,
      lockedAllUntil: null,
      rateLimitedUntil: null,
      lockedToModel: null,
      lockedToModelUntil: null,
      modelLocks: {},
      ...(validationData ? {
        providerSpecificData: {
          ...(conn?.providerSpecificData || {}),
          validationUrl: validationData.url,
          validationMessage: validationData.message,
          validationAt: new Date().toISOString(),
        },
      } : {}),
    });
    // Long L2 cooldown so the speed-layer cache also stops returning it.
    // Also drop the cached connection list itself: L2 cooldown keys only gate
    // already-cached rows, and stale caches kept serving the dead credential.
    cacheSetAccountCooldown(connectionId, 7 * 24 * 3600).catch(() => {});
    if (providerId) invalidateCachedConnections(providerId).catch(() => {});
    const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
    if (validationData) {
      log.warn("AUTH", `${connName} account verification required by upstream — validation URL saved, DISABLED (is_active=false), removed from routing`);
    } else {
      log.warn("AUTH", `${connName} account auth fatal error — DISABLED (is_active=false), removed from routing`);
    }
    if (provider && status && reason) {
      console.error(`❌ ${provider} [${status}]: ${reason}`);
    }
    return { shouldFallback: true, cooldownMs: 0 };
  }

  // OpenCode Zen uses 401 for workspace billing/model-entitlement failures.
  // These must not disable the API key: free models on the same account can
  // remain usable. Store a model-specific cooldown instead.
  if (!shouldFallback) return { shouldFallback: false, cooldownMs: 0 };

  // FINAL GUARD: "exhausted" (testStatus = "exhausted") is a TERMINAL account state
  // meaning EVERY model on the account is dead because global credits/quota are gone.
  // 1. Providers whose free models survive credit death or whose quota recovers on a timer
  //    must NEVER have testStatus = "exhausted".
  // 2. Antigravity requires snapshot proof that all buckets are 0% (credit wording on a single
  //    model's 429 must not exhaust the account).
  if (isExhausted) {
    if (!providerAllowsAccountExhausted(providerId)) {
      isExhausted = false;
      if (model && isCreditQuotaErrorText(lowerErr)) {
        lockAll = false;
      }
    } else if (providerId === "antigravity") {
      const isDurableSnapshotExhausted = Boolean(
        isQuotaMapExhausted(getQuotaCacheEntry(connectionId)?.quotas) ||
        (durableSnapshot && isQuotaMapExhausted(durableSnapshot.quotas))
      );
      if (!isDurableSnapshotExhausted) {
        isExhausted = false;
        lockAll = false;
      }
    }
  }

  const reason = typeof errorText === "string" ? errorText : (errorText ? String(errorText) : "Provider error");
  if (providerId === "antigravity") {
    cooldownMs = Math.min(cooldownMs, 24 * 60 * 60 * 1000);
  }
  const isAccountWideLock = Boolean(lockAll || githubResetAtMs);
  const lockTargetModel = isAccountWideLock ? null : model;
  const lockUpdate = buildModelLockUpdate(lockTargetModel, cooldownMs);
  const lockExpiryIso = new Date(Date.now() + cooldownMs).toISOString();

  // Extract validation_url from VALIDATION_REQUIRED 403 responses (Antigravity/Google)
  const fallbackValidationData = validationData || extractValidationUrl(candidateText);
  const resolvedTestStatus = is524Timeout
    ? (conn?.testStatus || "active")
    : isExhausted
      ? "exhausted"
      : (isAccountWideLock ? "unavailable" : (conn?.testStatus || "active"));

  // The account just proved itself unusable for this model: drop any
  // last-known-good pointer so the next selection re-scans instead of
  // fast-pathing straight back into the same dead account.
  delLkg(providerId, model).catch(() => {});

  await updateProviderConnection(connectionId, {
    ...lockUpdate,
    ...(isAccountWideLock ? { lockedAllUntil: lockExpiryIso } : {}),
    testStatus: resolvedTestStatus,
    lastError: is524Timeout ? (conn?.lastError || null) : reason,
    errorCode: is524Timeout ? null : status,
    lastErrorAt: is524Timeout ? (conn?.lastErrorAt || null) : new Date().toISOString(),
    backoffLevel: is524Timeout ? 0 : (newBackoffLevel ?? backoffLevel),
    ...(fallbackValidationData ? {
      providerSpecificData: {
        ...(conn?.providerSpecificData || {}),
        validationUrl: fallbackValidationData.url,
        validationMessage: fallbackValidationData.message,
        validationAt: new Date().toISOString(),
      },
    } : {}),
  });

  const lockKey = Object.keys(lockUpdate)[0];
  const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
  if (is524Timeout) {
    log.warn("AUTH", `${connName} temporary 524 gateway timeout (upstream slow/down) — transient fallback, no account error (cooldown ${Math.round(cooldownMs / 1000)}s)`);
  } else if (isExhausted) {
    log.warn("AUTH", `${connName} account quota/credits exhausted — LOCKED for ${Math.round(cooldownMs / (1000 * 3600 * 24))}d (status: exhausted) [${status}]`);
  } else {
    log.warn("AUTH", `${connName} locked ${lockKey} for ${Math.round(cooldownMs / 1000)}s [${status}]`);
  }

  // Sync with speed-layer cache
  const cooldownSecs = Math.ceil(cooldownMs / 1000);
  if (cooldownSecs > 0) {
    if (isAccountWideLock) {
      cacheSetAccountCooldown(connectionId, cooldownSecs).catch(() => {});
    } else if (model) {
      cacheSetModelCooldown(connectionId, model, cooldownSecs).catch(() => {});
    }
  }

  if (provider && status && reason) {
    console.error(`❌ ${provider} [${status}]: ${reason}`);
  }

  return { shouldFallback: true, cooldownMs };
}

/**
 * Clear account error status on successful request.
 * - Clears modelLock_${model} (the model that just succeeded)
 * - Lazy-cleans any other expired modelLock_* keys
 * - Resets error state only if no active locks remain
 * @param {string} connectionId
 * @param {object} currentConnection - credentials object (has _connection) or raw connection
 * @param {string|null} model - model that succeeded
 */
export async function clearAccountError(connectionId, currentConnection, model = null) {
  if (!connectionId || connectionId === "noauth") return;
  const conn = currentConnection._connection || currentConnection;
  const now = Date.now();
  // Locks live BOTH as flat modelLock_* fields and inside the modelLocks JSON
  // map (rowToConnection merges both, but credentials objects may carry only
  // the JSON map). Scan both, else a JSON-map-only lock never clears.
  const jsonLocks = conn.modelLocks && typeof conn.modelLocks === "object" ? conn.modelLocks : {};
  const allLockKeys = [...new Set([
    ...Object.keys(conn).filter(k => k.startsWith("modelLock_")),
    ...Object.keys(jsonLocks).map(m => `modelLock_${m}`),
  ])];
  const lockValue = (k) => conn[k] ?? jsonLocks[k.slice("modelLock_".length)];

  if (!conn.testStatus && !conn.lastError && allLockKeys.length === 0) return;

  // Keys to clear: current model's lock + all expired locks
  const keysToClear = allLockKeys.filter(k => {
    if (model && k === `modelLock_${model}`) return true; // succeeded model
    const expiry = lockValue(k);
    return expiry && new Date(expiry).getTime() <= now;   // expired
  });

  if (keysToClear.length === 0 && conn.testStatus !== "unavailable" && !conn.lastError) return;

  // Check if any active locks remain after clearing
  const remainingActiveLocks = allLockKeys.filter(k => {
    if (keysToClear.includes(k)) return false;
    const expiry = lockValue(k);
    return expiry && new Date(expiry).getTime() > now;
  });

  const clearObj = Object.fromEntries(keysToClear.map(k => [k, null]));

  // Reset testStatus to active if no account-wide lock (modelLock___all or lockedAllUntil) is active
  const hasActiveAccountLock = Boolean(
    (lockValue("modelLock___all") && new Date(lockValue("modelLock___all")).getTime() > now)
    || (conn.lockedAllUntil && new Date(conn.lockedAllUntil).getTime() > now)
    || (conn.rateLimitedUntil && new Date(conn.rateLimitedUntil).getTime() > now)
  );
  if (!hasActiveAccountLock) {
    clearObj.testStatus = "active";
    clearObj.lockedAllUntil = null;
    clearObj.rateLimitedUntil = null;
    if (remainingActiveLocks.length === 0) {
      Object.assign(clearObj, {
        lastError: null,
        errorCode: null,
        lastErrorAt: null,
        backoffLevel: 0
      });
      if (conn?.providerSpecificData?.validationUrl) {
        const psd = { ...(conn.providerSpecificData || {}) };
        delete psd.validationUrl;
        delete psd.validationMessage;
        delete psd.validationAt;
        clearObj.providerSpecificData = psd;
      }
    }
    cacheSetAccountCooldown(connectionId, 0).catch(() => {});
  }
  if (model) {
    cacheSetModelCooldown(connectionId, model, 0).catch(() => {});
  }
  if (conn?.provider) {
    resetModelFailCount(`provcircuit:${conn.provider}`).catch(() => {});
  }

  await updateProviderConnection(connectionId, clearObj);
}

/**
 * Extract API key from request headers
 */
export function extractApiKey(request) {
  // Check Authorization header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check Anthropic x-api-key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) {
    return xApiKey;
  }

  return null;
}

/**
 * Validate API key (optional - for local use can skip)
 */
export async function isValidApiKey(apiKey) {
  if (!apiKey) return false;
  return await validateApiKey(apiKey);
}

// Background proactive OAuth token refresh — independent of inbound requests.
// Fail-open everywhere: tick errors and per-connection failures never kill the interval.

import * as log from "../utils/logger.js";
import { acquireLock, releaseLock, isCacheAvailable } from "@/lib/cache/client.js";

// Single-process guard: without this,
// refreshOne silently skips every connection (acquireLock fails open
// with `false`) while logging a misleading "finished" line.
const localRefreshLocks = new Set();
// Transient-failure backoff: connections whose refresh failed with a
// non-permanent error get an escalating retry delay instead of re-firing
// every 60s tick (prevents endless churn on dead proxy pools / flaky upstreams).
const transientFailures = new Map(); // connectionId -> { count, nextRetryAt }
const TRANSIENT_RETRY_BASE_MS = 5 * 60 * 1000; // first retry after 5 min
const TRANSIENT_RETRY_MAX_MS = 60 * 60 * 1000; // cap at 1 hour

import { getRefreshLeadMs } from "open-sse/services/tokenRefresh.js";
import { getCredentialExpiryMs, shouldRefreshCredentials } from "open-sse/services/oauthCredentialManager.js";

/** Refresh when expiry is within 30 minutes (or the provider on-request lead, whichever larger). */
export const BACKGROUND_REFRESH_LEAD_MS = 30 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 1000;
const INITIAL_DELAY_MS = 10 * 1000;
const SENSITIVE_PROVIDERS = new Set(["antigravity", "gemini-cli"]);

let started = false;
let intervalHandle = null;
let initialTimeoutHandle = null;
let tickRunning = false;

function isTruthyEnv(value) {
  if (value == null || value === "") return false;
  const v = String(value).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isNonServerRuntime() {
  if (typeof window !== "undefined") return true;
  const phase = process.env.NEXT_PHASE || "";
  if (
    phase === "phase-production-build" ||
    phase === "phase-export" ||
    phase === "phase-static"
  ) {
    return true;
  }
  // Next.js build / static generation markers
  if (process.env.NEXT_RUNTIME === "edge") return true;
  return false;
}

/**
 * Pure selection: OAuth connections with a refreshToken whose access token
 * expires within max(provider on-request lead, BACKGROUND_REFRESH_LEAD_MS).
 *
 * @param {Array<object>} connections
 * @param {number} [nowMs]
 * @returns {Array<object>}
 */
export function selectConnectionsNeedingRefresh(connections, nowMs = Date.now()) {
  if (!Array.isArray(connections) || connections.length === 0) return [];

  const out = [];
  for (const conn of connections) {
    if (!conn) continue;

    const authType = String(conn.authType || "").toLowerCase().replace(/_/g, "");
    if (authType !== "oauth") continue;
    if (!conn.refreshToken) continue;
    // Refresh token known-dead (invalid_grant/invalid_request) — stop retrying
    // every tick; surfaced as "re-login required" instead.
    if (conn.providerSpecificData?.refreshBlocked) continue;

    // Transient-failure backoff: skip until the next retry slot opens.
    const backoff = transientFailures.get(conn.id);
    if (backoff && nowMs < backoff.nextRetryAt) continue;

    if (shouldRefreshCredentials(conn.provider, conn, nowMs)) {
      out.push(conn);
      continue;
    }

    const expiresAtMs = getCredentialExpiryMs(conn);
    if (expiresAtMs === null) {
      out.push(conn);
      continue;
    }

    const providerLead = getRefreshLeadMs(conn.provider);
    const leadMs = Math.max(
      Number.isFinite(providerLead) ? providerLead : 0,
      BACKGROUND_REFRESH_LEAD_MS
    );

    if (expiresAtMs - nowMs < leadMs) {
      out.push(conn);
    }
  }
  return out;
}

async function loadActiveConnections() {
  // Sweep legacy tombstones: rows disabled or refreshBlocked with an EXPIRED
  // token are dead grants by definition — nothing revives them (re-auth
  // creates a fresh connection). Covers BOTH isActive=false tombstones and
  // active-but-refreshBlocked rows (limbo: skipped by selection, never
  // cleaned). One bounded batch per tick.
  try {
    const { getProviderConnections, deleteProviderConnectionsByIds } = await import(
      "../../lib/db/repos/connectionsRepo.js"
    );
    const dead = await getProviderConnections({ isActive: false, limit: 200 });
    const limbo = await getProviderConnections({
      isActive: true,
      authType: "oauth",
      tokenExpiresBefore: new Date().toISOString(),
      limit: 200,
    });
    const tombstoned = dead.filter((c) => {
      const expiresAtMs = getCredentialExpiryMs(c);
      return expiresAtMs !== null && expiresAtMs < Date.now();
    });
    // Active + refreshBlocked + token already expired = permanent dead grant.
    const limboDead = limbo.filter((c) => c.providerSpecificData?.refreshBlocked);
    const doomed = [...tombstoned, ...limboDead];
    if (doomed.length > 0) {
      const n = await deleteProviderConnectionsByIds(doomed.map((c) => c.id)).catch(() => 0);
      if (n > 0) {
        log.info("BG_TOKEN_REFRESH", `Swept ${n} dead grant(s) (expired tokens, blocked or tombstoned)`, {
          providers: [...new Set(doomed.map((c) => c.provider))],
        });
      }
    }
  } catch (err) {
    log.debug("BG_TOKEN_REFRESH", `Tombstone sweep skipped: ${err?.message ?? err}`);
  }

  // Dynamic import avoids circular load with db / app graph at module eval time.
  const { getProviderConnections } = await import("../../lib/db/repos/connectionsRepo.js");
  // Keep scheduler memory bounded. Expiry ordering is handled in SQL; the
  // refresh loop can process another bounded batch on the next tick.
  return getProviderConnections({
    isActive: true,
    authType: "oauth",
    tokenExpiresBefore: new Date(Date.now() + BACKGROUND_REFRESH_LEAD_MS).toISOString(),
    limit: 500,
  });
}

async function refreshOne(connection) {
  // Use distributed lock to avoid concurrent refresh across cluster nodes
  const lockKey = `refresh:${connection.id}`;
  const lockToken = await acquireLock(lockKey, 45);
  const acquired = Boolean(lockToken);
  let localLocked = false;
  if (!acquired) {
    if (!isCacheAvailable()) {
      // Serialize in-process instead of skipping silently.
      if (localRefreshLocks.has(connection.id)) {
        log.debug("BG_TOKEN_REFRESH", `Skipping refresh for ${connection.id}: local refresh in flight`);
        return null;
      }
      localRefreshLocks.add(connection.id);
      localLocked = true;
      log.debug("BG_TOKEN_REFRESH", `Using in-process refresh lock for ${connection.id}`);
    } else {
      log.debug("BG_TOKEN_REFRESH", `Skipping refresh for ${connection.id}: locked by another worker`);
      return null;
    }
  }

  try {
    const { checkAndRefreshToken } = await import("./tokenRefresh.js");
    const result = await checkAndRefreshToken(connection.provider, connection, { force: true });

    if (result?.refreshError) {
      // Transient (non-permanent) failure: escalating backoff instead of a
      // re-fire every tick. Permanent errors are handled below by deletion.
      const prev = transientFailures.get(connection.id);
      const count = (prev?.count || 0) + 1;
      const delay = Math.min(TRANSIENT_RETRY_BASE_MS * 2 ** (count - 1), TRANSIENT_RETRY_MAX_MS);
      transientFailures.set(connection.id, { count, nextRetryAt: Date.now() + delay });
      log.debug("BG_TOKEN_REFRESH", `Refresh failed transiently — retry in ${Math.round(delay / 1000)}s (attempt ${count})`, {
        id: connection.id,
        provider: connection.provider,
      });
    } else {
      transientFailures.delete(connection.id);
    }

    // Dead refresh token (revoked/reused/expired): persist the block marker and
    // disable the connection from routing so it does not stay "active". The marker is
    // lifted by checkAndRefreshToken on the next successful re-auth.
    if (result?.refreshError) {
      // Check if access token is still valid before disabling.
      // If access token has not expired yet, keep the connection active!
      const expiresAt = connection.expiresAt ? new Date(connection.expiresAt).getTime() : null;
      const isAccessTokenStillValid = expiresAt && expiresAt > Date.now() + 30_000;

      if (!isAccessTokenStillValid) {
        // Dead grant (revoked/expired/access_denied): DELETE the connection
        // outright — a tombstone row keeps accumulating disabled entries that
        // nothing revives (re-auth creates a fresh connection anyway).
        const { deleteProviderConnection } = await import("../../lib/db/repos/connectionsRepo.js");
        const deleted = await deleteProviderConnection(connection.id).catch(() => false);
        if (deleted) {
          log.warn("BG_TOKEN_REFRESH", "Refresh token unrecoverable — connection DELETED (dead grant, re-auth to restore)", {
            id: connection.id,
            provider: connection.provider,
            email: connection.email || connection.name || "",
            error: result.refreshError,
          });
        } else {
          // Delete raced with another worker — make sure it's at least inactive.
          const { updateProviderConnection } = await import("../../lib/db/repos/connectionsRepo.js");
          await updateProviderConnection(connection.id, {
            isActive: false,
            testStatus: "disabled",
            disabledBy: "system",
            errorCode: 401,
          }).catch(() => {});
          log.warn("BG_TOKEN_REFRESH", "Refresh token unrecoverable — connection delete raced, marked inactive", {
            id: connection.id,
            provider: connection.provider,
          });
        }
      } else {
        log.warn("BG_TOKEN_REFRESH", "Refresh token failed, but access token is still valid — keeping connection active", {
          id: connection.id,
          provider: connection.provider,
          expiresAt: connection.expiresAt,
        });
      }
    }
    return result;
  } finally {
    if (localLocked) {
      localRefreshLocks.delete(connection.id);
    } else {
      await releaseLock(lockKey, lockToken).catch(() => {});
    }
  }
}

/**
 * One scheduler tick. Fail-open at top level and per connection.
 * @param {{ loadConnections?: Function, refreshConnection?: Function }} [deps]
 */
export async function runBackgroundTokenRefreshTick(deps = {}) {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const load = deps.loadConnections || loadActiveConnections;
    const refresh = deps.refreshConnection || refreshOne;
    const sleep = deps.sleep || ((ms) => new Promise((res) => setTimeout(res, ms)));

    const connections = await load();
    const due = selectConnectionsNeedingRefresh(connections, Date.now());

    if (due.length === 0) return;

    const baseSensitiveDelay = Number(process.env.BG_REFRESH_GOOGLE_DELAY_MS) || 12_000;
    const baseNormalDelay = Number(process.env.BG_REFRESH_DELAY_MS) || 1_500;
    const maxConcurrent = Math.max(1, Number(process.env.BG_REFRESH_CONCURRENCY) || 4);

    // Group by provider so the concurrency cap and pacing apply per provider
    // (a burst of grok-cli refreshes must not starve antigravity slots, and
    // sensitive Google providers keep their strict 12s spacing).
    const byProvider = new Map();
    for (const conn of due) {
      const list = byProvider.get(conn.provider) || [];
      list.push(conn);
      byProvider.set(conn.provider, list);
    }

    const refreshWithLog = async (conn) => {
      try {
        const result = await refresh(conn);
        if (result !== null) {
          log.info("BG_TOKEN_REFRESH", "Connection refresh finished", {
            id: conn.id,
            email: conn.email || conn.name || conn.id,
            provider: conn.provider,
          });
        }
      } catch (err) {
        log.warn("BG_TOKEN_REFRESH", "Connection refresh failed (swallowed)", {
          id: conn?.id,
          email: conn?.email || conn?.name || conn?.id,
          provider: conn?.provider,
          error: err?.message ?? String(err),
        });
      }
    };

    const runProviderQueue = async (provider, list) => {
      const isSensitive = SENSITIVE_PROVIDERS.has(provider);
      const baseDelay = isSensitive ? baseSensitiveDelay : baseNormalDelay;
      let idx = 0;
      const workers = Array.from({ length: Math.min(maxConcurrent, list.length) }, async () => {
        while (idx < list.length) {
          const conn = list[idx++];
          await refreshWithLog(conn);
          // Stagger only after an actual refresh ran; skipped/locked
          // connections return quickly and must not throttle the queue.
          if (idx < list.length) {
            const jitter = isSensitive ? Math.floor(Math.random() * 4000) : 200;
            await sleep(baseDelay + jitter);
          }
        }
      });
      await Promise.all(workers);
    };

    await Promise.all(
      Array.from(byProvider.entries(), ([provider, list]) => runProviderQueue(provider, list)),
    );
  } catch (err) {
    log.warn("BG_TOKEN_REFRESH", "Tick failed (swallowed)", {
      error: err?.message ?? String(err),
    });
  } finally {
    tickRunning = false;
  }
}

/**
 * Start the background interval. Safe to call multiple times (no-op if already started).
 * @param {{ intervalMs?: number }} [opts]
 * @returns {boolean} true if started this call
 */
export function startBackgroundTokenRefresh({ intervalMs } = {}) {
  if (started) return false;
  if (isTruthyEnv(process.env.DISABLE_BACKGROUND_TOKEN_REFRESH)) return false;
  if (isNonServerRuntime()) return false;

  started = true;
  const period = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS;

  const safeTick = () => {
    runBackgroundTokenRefreshTick().catch((err) => {
      log.warn("BG_TOKEN_REFRESH", "Unhandled tick rejection (swallowed)", {
        error: err?.message ?? String(err),
      });
    });
  };

  // First pass soon after boot so idle connections don't wait a full interval.
  initialTimeoutHandle = setTimeout(safeTick, INITIAL_DELAY_MS);
  if (initialTimeoutHandle.unref) initialTimeoutHandle.unref();

  intervalHandle = setInterval(safeTick, period);
  if (intervalHandle.unref) intervalHandle.unref();

  return true;
}

export function stopBackgroundTokenRefresh() {
  if (initialTimeoutHandle) {
    clearTimeout(initialTimeoutHandle);
    initialTimeoutHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (started) {
    started = false;
  }
}

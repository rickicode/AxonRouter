import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../providers/index.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy.js";
import { getProviderCredentials, markAccountUnavailable } from "@/sse/services/auth.js";
import { setProviderModelCooldown } from "@/lib/cache/client.js";
import { markPoolUnfit } from "../services/proxyPoolFitness.js";
import { recordRuntimeProxyFailure, recordRuntimeProxySuccess } from "@/lib/network/proxyHealth.js";
import { STREAM_COMMIT_PEEK_MS } from "../config/runtimeConfig.js";
import { clampModelCooldownSeconds } from "../config/errorConfig.js";
import { peekStreamHead } from "../utils/streamHandler.js";

const HEDGE_DELAY_MS = 1000;
const MAX_HEDGE_CONCURRENCY = 4;
const MAX_TOTAL_HEDGE_ATTEMPTS = 10;
// Fleet-size threshold that switches the model-capacity cooldown from the upstream
// hint (clamped) to a fixed long park. See the cooldown site for why.
const LARGE_FLEET_ACCOUNT_THRESHOLD = 1000;
const LARGE_FLEET_COOLDOWN_SECONDS = 300;
const FLEET_SIZE_TTL_MS = 60_000;
let fleetSizeCache = { at: 0, size: 0 };

async function tokenHarborFleetSize() {
  if (Date.now() - fleetSizeCache.at < FLEET_SIZE_TTL_MS) return fleetSizeCache.size;
  try {
    const { countProviderConnections } = await import("@/lib/db/repos/connectionsRepo.js");
    const n = Number(await countProviderConnections("tokenharbor")) || 0;
    fleetSizeCache = { at: Date.now(), size: n };
    return n;
  } catch {
    // Never let a failed count widen the cooldown decision — 0 means "small fleet".
    return fleetSizeCache.size;
  }
}
export class TokenHarborExecutor extends BaseExecutor {
  constructor() {
    super("tokenharbor", PROVIDERS.tokenharbor || { baseUrl: "https://tokenharbor.ai/v1/chat/completions" });
  }

  buildUrl(_model, _stream, urlIndex = 0) {
    const baseUrls = this.getBaseUrls();
    return baseUrls[urlIndex] || baseUrls[0] || "https://tokenharbor.ai/v1/chat/completions";
  }

  buildHeaders(credentials, stream = true) {
    const headers = {
      "Content-Type": "application/json",
      "Accept": stream ? "text/event-stream" : "application/json",
      ...this.config.headers,
    };

    if (credentials?.apiKey) {
      headers["Authorization"] = `Bearer ${credentials.apiKey}`;
    }

    return headers;
  }

  transformRequest(model, body, stream) {
    const out = { ...body };
    if (stream && !out.stream_options) {
      out.stream_options = { include_usage: true };
    }
    return out;
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    const transformedBody = this.transformRequest(model, body, stream);
    const bodyStr = JSON.stringify(transformedBody);
    const url = this.buildUrl(model, stream, 0);

    const activeTasks = new Map();
    const triedConnectionIds = new Set();
    let winner = null;
    let lastError = null;
    let lastFailedResponse = null;
    let lastFailedUrl = null;
    let lastFailedHeaders = null;
    let capacityFailures = 0;
    let exhaustedPool = false;
    const spawnAttempt = (creds, pOptions) => {
      const connId = creds?.connectionId || "default";
      const connName = creds?.connectionName || creds?.name || creds?.email || (connId.length > 8 ? connId.slice(0, 8) : connId);
      const headers = this.buildHeaders(creds, stream);

      const attemptController = new AbortController();
      const mergedSignal = signal ? AbortSignal.any([signal, attemptController.signal]) : attemptController.signal;

      const task = {
        connId,
        connName,
        controller: attemptController,
        promise: null,
      };

      const fetchPromise = (async () => {
        try {
          const resp = await proxyAwareFetch(url, {
            method: "POST",
            headers,
            body: bodyStr,
            signal: mergedSignal,
          }, pOptions);

          if (!resp.ok) {
            const bodyText = await resp.text().catch(() => "");
            let errReason = `HTTP ${resp.status}: ${bodyText.slice(0, 200)}`;
            const isModelCapacity = resp.status === 429 && /model is at capacity|at capacity for your account|retry in about/i.test(bodyText);
            const isRegionBlock = resp.status === 403 && /request was refused|request_forbidden|region is not available/i.test(bodyText);

            // Region block = IP/proxy problem, NOT account problem.
            // Mark the proxy pool unfit instead of locking the account.
            if (isRegionBlock && pOptions?.proxyPoolId) {
              // markPoolUnfit is SYNC (returns undefined) and takes (poolId, scope, until, reason).
              // Passing errReason as the 3rd arg landed it in `until`, breaking isPoolFit()'s
              // numeric comparison — the pool never became unfit. Pass it as `reason`.
              // Scope provider-wide (`tokenharbor::*`): a region-blocked or refusing egress
              // is a property of the exit IP, not of this model. A `tokenharbor::model`
              // mark only excluded the one model that tripped over it while the account's
              // other models kept being routed straight back through the blocked pool.
              markPoolUnfit(pOptions.proxyPoolId, "tokenharbor::*", undefined, errReason);
              void recordRuntimeProxyFailure(pOptions.proxyPoolId)?.catch?.(() => {});
              log?.warn?.("HEDGE", `[TokenHarbor] Region block on pool ${pOptions.proxyPoolId}, marked unfit (not locking account ${connName})`);
            } else if (isRegionBlock && !pOptions?.connectionProxyEnabled) {
              // Direct egress region block — do NOT lock the account
              log?.warn?.("HEDGE", `[TokenHarbor] Direct egress region-blocked for ${connName}. Account NOT locked (IP problem, not account problem).`);
            } else {
              await markAccountUnavailable(connId, resp.status, errReason, "tokenharbor", model).catch(() => {});
            }

            if (pOptions?.connectionProxyEnabled && pOptions?.proxyPoolId && !isRegionBlock) {
              recordRuntimeProxyFailure(pOptions.proxyPoolId).catch(() => {});
            }

            return {
              ok: false,
              status: resp.status,
              error: errReason,
              connId,
              connName,
              isModelCapacity,
              isRegionBlock,
              response: new Response(bodyText, {
                status: resp.status,
                statusText: resp.statusText,
                headers: resp.headers,
              }),
              url,
              headers,
            };
          }
          let response = resp;
          if (stream && resp.body) {
            const peeked = await peekStreamHead(resp.body, STREAM_COMMIT_PEEK_MS);
            if (peeked.failed) {
              const errReason = peeked.error?.message || "empty stream";
              markAccountUnavailable(connId, 502, errReason, "tokenharbor", model).catch(() => {});
              return { ok: false, status: 502, error: errReason, connId };
            }
            response = new Response(peeked.stream, {
              status: resp.status,
              statusText: resp.statusText,
              headers: resp.headers,
            });
          }

          return {
            ok: true,
            response,
            url,
            headers,
            transformedBody,
            connId,
            connName,
            proxyPoolId: pOptions?.proxyPoolId,
          };
        } catch (err) {
          if (err.name === "AbortError" && attemptController.signal.aborted) {
            return { ok: false, aborted: true };
          }
          return { ok: false, error: err.message, connId };
        }
      })();

      task.promise = fetchPromise
        .then((res) => ({ task, res }))
        .catch((err) => ({ task, res: { ok: false, error: err.message } }));

      return task;
    };

    // Spawn first attempt
    if (credentials?.connectionId) triedConnectionIds.add(credentials.connectionId);
    const initialTask = spawnAttempt(credentials, proxyOptions);
    activeTasks.set(initialTask.promise, initialTask);

    while (!winner && activeTasks.size > 0) {
      if (signal?.aborted) break;

      const canHedgeMore = activeTasks.size < MAX_HEDGE_CONCURRENCY && triedConnectionIds.size < MAX_TOTAL_HEDGE_ATTEMPTS;

      let timer = null;
      const timeoutPromise = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ isTimeout: true }), HEDGE_DELAY_MS);
      });

      const raced = await Promise.race([
        ...Array.from(activeTasks.keys()),
        timeoutPromise,
      ]);

      if (timer) clearTimeout(timer);

      if (raced && raced.isTimeout) {
        if (canHedgeMore) {
          log?.info?.("HEDGE", `[TokenHarbor] Upstream slow (> ${HEDGE_DELAY_MS}ms), spawning speculative companion...`);
          try {
            const nextCreds = await getProviderCredentials("tokenharbor", triedConnectionIds, model);
            if (nextCreds && !nextCreds.allRateLimited && nextCreds.apiKey) {
              triedConnectionIds.add(nextCreds.connectionId);
              let nextProxyOptions = null;
              const proxyData = nextCreds.providerSpecificData || {};
              const resolvedProxy = await resolveConnectionProxyConfig(proxyData, nextCreds.connectionId);
              if (resolvedProxy?.proxyPoolId) {
                nextProxyOptions = {
                  connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
                  connectionProxyUrl: resolvedProxy.connectionProxyUrl,
                  connectionNoProxy: resolvedProxy.connectionNoProxy,
                  proxyPoolId: resolvedProxy.proxyPoolId,
                };
              }
              const companionTask = spawnAttempt(nextCreds, nextProxyOptions);
              activeTasks.set(companionTask.promise, companionTask);
            }
          } catch (e) {
            log?.warn?.("HEDGE", `Failed to get companion credentials: ${e.message}`);
          }
        }
        continue;
      }

      // One of the active tasks settled
      const { task, res } = raced;
      activeTasks.delete(task.promise);

      if (res.ok) {
        winner = res;
        log?.info?.("HEDGE", `[TokenHarbor] Winner account selected: ${res.connName}`);
        if (res.proxyPoolId) {
          recordRuntimeProxySuccess(res.proxyPoolId).catch(() => {});
        }
        break;
      } else {
        lastError = res.error || "Attempt failed";
        if (res.response) {
          lastFailedResponse = res.response;
          lastFailedUrl = res.url;
          lastFailedHeaders = res.headers;
        }
        if (res.isModelCapacity) {
          capacityFailures++;
          log?.info?.("HEDGE", `[TokenHarbor] Account ${res.connName} at model capacity (${capacityFailures}/${MAX_TOTAL_HEDGE_ATTEMPTS}). Trying next account...`);
        }
        if (activeTasks.size === 0 && triedConnectionIds.size < MAX_TOTAL_HEDGE_ATTEMPTS) {
          let nextCreds = null;
          try {
            nextCreds = await getProviderCredentials("tokenharbor", triedConnectionIds, model);
          } catch (e) {
            log?.warn?.("HEDGE", `Failed to get next credentials after failure: ${e.message}`);
          }
          if (nextCreds && !nextCreds.allRateLimited && nextCreds.apiKey) {
            triedConnectionIds.add(nextCreds.connectionId);
            let nextProxyOptions = null;
            const proxyData = nextCreds.providerSpecificData || {};
            const resolvedProxy = await resolveConnectionProxyConfig(proxyData, nextCreds.connectionId);
            if (resolvedProxy?.proxyPoolId) {
              nextProxyOptions = {
                connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
                connectionProxyUrl: resolvedProxy.connectionProxyUrl,
                connectionNoProxy: resolvedProxy.connectionNoProxy,
                proxyPoolId: resolvedProxy.proxyPoolId,
              };
            }
            const companionTask = spawnAttempt(nextCreds, nextProxyOptions);
            activeTasks.set(companionTask.promise, companionTask);
          } else {
            // No usable credential remains — the credential pool is exhausted for
            // this request. Remember it so the post-loop block can promote to a
            // provider-wide model cooldown (see `exhaustedPool` below).
            exhaustedPool = true;
          }
        } else if (activeTasks.size === 0 && triedConnectionIds.size >= MAX_TOTAL_HEDGE_ATTEMPTS) {
          exhaustedPool = true;
        }
      }
    }

    // Cancel all remaining speculative attempts
    for (const task of activeTasks.values()) {
      try {
        task.controller.abort();
      } catch {}
    }
    // Upstream 429 "model is at capacity" is a PER-MODEL signal, not a per-account
    // one. Once the credential pool is exhausted and every failure was a capacity
    // 429, put the model into a provider-wide cooldown so the next request does
    // not re-hammer all accounts. The old `capacityFailures >= 10` guard never
    // fired on small pools (or when credentials ran out before 10 tries), so the
    // cooldown was effectively dead and requests hot-looped.
    if (!winner && capacityFailures > 0 && exhaustedPool) {
      const retryMatch = lastError?.match(/retry in about (\d+) seconds/i);
      const upstreamHint = retryMatch ? parseInt(retryMatch[1], 10) : NaN;
      const fleetSize = await tokenHarborFleetSize();
      // Above the threshold the "at capacity" signal is fleet-wide, not per-account:
      // every account burns out at roughly the same time, so the upstream "retry in
      // ~30s" hint is far shorter than the fleet needs to actually recover. Parking
      // the model for a minute just re-exhausts it, and every retry lands on 10 more
      // accounts (the observed meltdown: 2k accounts tried, 17% success). Below the
      // threshold the account genuinely is the problem and the short clamp is right.
      const isLargeFleet = fleetSize > LARGE_FLEET_ACCOUNT_THRESHOLD;
      const retrySecs = isLargeFleet ? LARGE_FLEET_COOLDOWN_SECONDS : clampModelCooldownSeconds(upstreamHint);
      void Promise.resolve(setProviderModelCooldown("tokenharbor", model, retrySecs)).catch(() => {});
      log?.warn?.(
        "HEDGE",
        `[TokenHarbor] All ${capacityFailures} available account(s) reached model capacity for ${model} ` +
          `(fleet ${fleetSize}${isLargeFleet ? " >" + LARGE_FLEET_ACCOUNT_THRESHOLD : ""}). ` +
          `Setting ${retrySecs}s provider-wide model cooldown.`
      );
    }

    if (winner) {
      return {
        response: winner.response,
        url: winner.url,
        headers: winner.headers,
        transformedBody: winner.transformedBody,
      };
    }

    if (lastFailedResponse) {
      return {
        response: lastFailedResponse,
        url: lastFailedUrl,
        headers: lastFailedHeaders,
      };
    }

    throw new Error(`[TokenHarbor] All speculative attempts failed: ${lastError || "No response"}`);
  }
}
export default TokenHarborExecutor;

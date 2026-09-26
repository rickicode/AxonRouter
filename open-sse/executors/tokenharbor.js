import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../providers/index.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy.js";
import { getProviderCredentials, markAccountUnavailable } from "@/sse/services/auth.js";
import { peekStreamHead } from "../utils/streamHandler.js";
import { STREAM_COMMIT_PEEK_MS } from "../config/runtimeConfig.js";

const HEDGE_DELAY_MS = 1000;
const MAX_HEDGE_CONCURRENCY = 4;
const MAX_TOTAL_HEDGE_ATTEMPTS = 8;

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
            markAccountUnavailable(connId, resp.status, errReason, "tokenharbor", model).catch(() => {});
            return { ok: false, status: resp.status, error: errReason, connId };
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
              if (nextCreds.providerSpecificData) {
                const resolvedProxy = await resolveConnectionProxyConfig(nextCreds.providerSpecificData, nextCreds.connectionId);
                if (resolvedProxy?.proxyPoolId) {
                  nextProxyOptions = {
                    connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
                    connectionProxyUrl: resolvedProxy.connectionProxyUrl,
                    connectionNoProxy: resolvedProxy.connectionNoProxy,
                    proxyPoolId: resolvedProxy.proxyPoolId,
                  };
                }
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
        break;
      } else {
        lastError = res.error || "Attempt failed";
        if (activeTasks.size === 0 && triedConnectionIds.size < MAX_TOTAL_HEDGE_ATTEMPTS) {
          try {
            const nextCreds = await getProviderCredentials("tokenharbor", triedConnectionIds, model);
            if (nextCreds && !nextCreds.allRateLimited && nextCreds.apiKey) {
              triedConnectionIds.add(nextCreds.connectionId);
              let nextProxyOptions = null;
              if (nextCreds.providerSpecificData) {
                const resolvedProxy = await resolveConnectionProxyConfig(nextCreds.providerSpecificData, nextCreds.connectionId);
                if (resolvedProxy?.proxyPoolId) {
                  nextProxyOptions = {
                    connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
                    connectionProxyUrl: resolvedProxy.connectionProxyUrl,
                    connectionNoProxy: resolvedProxy.connectionNoProxy,
                    proxyPoolId: resolvedProxy.proxyPoolId,
                  };
                }
              }
              const companionTask = spawnAttempt(nextCreds, nextProxyOptions);
              activeTasks.set(companionTask.promise, companionTask);
            }
          } catch (e) {
            log?.warn?.("HEDGE", `Failed to get next credentials after failure: ${e.message}`);
          }
        }
      }
    }

    // Cancel all remaining speculative attempts
    for (const task of activeTasks.values()) {
      try {
        task.controller.abort();
      } catch {}
    }

    if (winner) {
      return {
        response: winner.response,
        url: winner.url,
        headers: winner.headers,
        transformedBody: winner.transformedBody,
      };
    }

    throw new Error(`[TokenHarbor] All speculative attempts failed: ${lastError || "No response"}`);
  }
}

export default TokenHarborExecutor;

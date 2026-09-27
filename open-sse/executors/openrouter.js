/**
 * OpenRouter Speculative Hedging Executor
 *
 * Implements speculative companion requests with a 1-second delay for OpenRouter.
 * OpenRouter free-tier models frequently experience cold-start queueing or proxy stalls.
 *
 * 1. Dispatches the initial request with primary credentials.
 * 2. If the first SSE chunk has not arrived within HEDGE_DELAY_MS (1000ms),
 *    fetches the next available OpenRouter connection from the DB pool and spawns
 *    a speculative companion attempt.
 * 3. The first attempt to return HTTP 200 and a valid stream head wins;
 *    all losers are aborted immediately via AbortController.
 */

import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../providers/index.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy.js";
import { getProviderCredentials, markAccountUnavailable } from "@/sse/services/auth.js";
import { peekStreamHead } from "../utils/streamHandler.js";
import { STREAM_COMMIT_PEEK_MS } from "../config/runtimeConfig.js";
import { injectReasoningContent } from "../utils/reasoningContentInjector.js";

const HEDGE_DELAY_MS = 1000;
const MAX_HEDGE_CONCURRENCY = 4;
const MAX_TOTAL_HEDGE_ATTEMPTS = 8;

export class OpenRouterExecutor extends BaseExecutor {
  constructor() {
    super("openrouter", PROVIDERS.openrouter);
  }

  buildUrl() {
    return this.config.baseUrl || "https://openrouter.ai/api/v1/chat/completions";
  }

  buildHeaders(credentials, stream = true) {
    const headers = {
      "Content-Type": "application/json",
      "HTTP-Referer": "https://endpoint-proxy.local",
      "X-Title": "Endpoint Proxy",
      ...(this.config.headers || {}),
    };
    if (credentials?.apiKey) {
      headers["Authorization"] = `Bearer ${credentials.apiKey}`;
    }
    if (stream) {
      headers["Accept"] = "text/event-stream";
    }
    return headers;
  }

  transformRequest(model, body) {
    let transformed = body;
    if (body && typeof body === "object") {
      transformed = { ...body };
      if (!transformed.model && model) transformed.model = model;
    }
    return injectReasoningContent({ provider: this.provider, model, body: transformed });
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    const triedConnectionIds = new Set();
    const activeTasks = new Map();
    let winner = null;
    let lastError = null;

    const spawnAttempt = (creds, pOptions) => {
      const attemptController = new AbortController();
      const connId = creds?.connectionId || "default";
      const connName = creds?.name || creds?.email || connId;

      const mergedSignal = signal
        ? AbortSignal.any([signal, attemptController.signal])
        : attemptController.signal;

      const url = this.buildUrl();
      const transformedBody = this.transformRequest(model, body, stream, creds);
      const headers = this.buildHeaders(creds, stream);

      const task = {
        controller: attemptController,
        connectionId: connId,
        connName,
        promise: null,
      };

      const fetchPromise = (async () => {
        try {
          const bodyStr = typeof transformedBody === "string" || transformedBody instanceof Uint8Array
            ? transformedBody
            : JSON.stringify(transformedBody);

          const resp = await proxyAwareFetch(
            url,
            {
              method: "POST",
              headers,
              body: bodyStr,
              signal: mergedSignal,
            },
            pOptions
          );

          if (!resp.ok) {
            const bodyText = await resp.text().catch(() => "");
            let errReason = `HTTP ${resp.status}: ${bodyText.slice(0, 200)}`;
            markAccountUnavailable(connId, resp.status, errReason, "openrouter", model).catch(() => {});
            return { ok: false, status: resp.status, error: errReason, connId };
          }

          let response = resp;
          if (stream && resp.body) {
            const peeked = await peekStreamHead(resp.body, STREAM_COMMIT_PEEK_MS);
            if (peeked.failed) {
              const errReason = peeked.error?.message || "empty stream";
              markAccountUnavailable(connId, 502, errReason, "openrouter", model).catch(() => {});
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
          log?.info?.("HEDGE", `[OpenRouter] Upstream slow (> ${HEDGE_DELAY_MS}ms), spawning speculative companion...`);
          try {
            const nextCreds = await getProviderCredentials("openrouter", triedConnectionIds, model);
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
            log?.warn?.("HEDGE", `Failed to get OpenRouter companion credentials: ${e.message}`);
          }
        }
        continue;
      }

      // One of the active tasks settled
      const { task, res } = raced;
      activeTasks.delete(task.promise);

      if (res.ok) {
        winner = res;
        log?.info?.("HEDGE", `[OpenRouter] Winner account selected: ${res.connName}`);
        break;
      } else {
        lastError = res.error || "Attempt failed";
        if (activeTasks.size === 0 && triedConnectionIds.size < MAX_TOTAL_HEDGE_ATTEMPTS) {
          try {
            const nextCreds = await getProviderCredentials("openrouter", triedConnectionIds, model);
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
            log?.warn?.("HEDGE", `Failed to get OpenRouter next credentials after failure: ${e.message}`);
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

    throw new Error(`[OpenRouter] All speculative attempts failed: ${lastError || "No response"}`);
  }
}

export default OpenRouterExecutor;

import { NextResponse } from "@/lib/http/response.js";
import { getProviderConnections, getAvailableAccountsForRouting } from "@/lib/localDb";
import { PROVIDER_ID_TO_ALIAS, getProviderModels } from "open-sse/config/providerModels.js";
import { resolveProviderId } from "@/shared/constants/providers.js";
import { PROVIDERS } from "open-sse/config/providers.js";
import { pingModelByKind } from "@/app/api/models/test/ping";
import { FILTERS } from "@/app/api/providers/suggested-models/filters.js";

const PAID_ERROR_REGEX = /402|insufficient_user_quota|预扣费额度失败|用户剩余额度|用户额度不足|credits exhausted|insufficient credits|insufficient balance|out of credits|insufficient_quota|exceeded your current quota|PAID_MODEL_AUTH_REQUIRED|sign in to use this model|requires authentication|payment required|insufficient balance/i;

function isPaidError(status, errorText = "") {
  if (status === 402) return true;
  return PAID_ERROR_REGEX.test(String(errorText));
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True when every model a provider exposes is free-tier by construction
 * (dedicated free endpoints: cline-free, llm7-free, ovhcloud-free, opencode…).
 */
function isDedicatedFreeProvider(providerId, pConfig) {
  if (providerId.endsWith("-free")) return true;
  if (pConfig?.category === "free") return true;
  if (pConfig?.noAuth === true && pConfig?.trialKey !== true) return true;
  return false;
}

/**
 * True when a single model entry looks free: ":free"/"-free" suffix, an explicit
 * isFree flag, or free wording in the display name.
 */
function isFreeShaped(model) {
  if (!model) return false;
  const id = typeof model === "string" ? model : model.id;
  if (!id || typeof id !== "string") return false;
  if (typeof model === "object" && model.isFree === true) return true;
  if (id.endsWith(":free") || id.endsWith("-free") || id.includes("/free") || id.includes(":free/")) return true;
  const name = String(typeof model === "object" ? model.name || "" : "").toLowerCase();
  return name.includes("(free)") || name.includes(" free");
}

/**
 * Fetch candidate models for a provider based on its modelsFetcher, registry, or known free endpoints.
 */
async function fetchCandidatesForProvider(providerId, alias) {
  const candidatesMap = new Map();

  const addCandidate = (m) => {
    if (!m) return;
    const id = typeof m === "string" ? m : m.id || m.name;
    if (!id || typeof id !== "string") return;
    const trimmedId = id.trim();
    if (!trimmedId) return;
    const name = (typeof m === "object" && m.name) ? m.name : trimmedId;
    if (!candidatesMap.has(trimmedId)) {
      candidatesMap.set(trimmedId, { id: trimmedId, name });
    }
  };

  // 1. Registered models. PROVIDER_MODELS is keyed by UI alias (l7f, kc, oc)
  // while the route receives the provider id — look up both. Free-only providers
  // admit all their registered models;
  // mixed/freeTier providers (TokenHarbor, OpenRouter, KiloCode) admit only the
  // free-shaped slice so users don't burn tokens probing paid models.
  const pConfig = PROVIDERS[providerId] || {};
  const allFree = isDedicatedFreeProvider(providerId, pConfig);
  const registryModels = [
    ...getProviderModels(providerId),
    ...getProviderModels(alias),
  ];
  for (const m of registryModels) {
    if (allFree || isFreeShaped(m)) addCandidate(m);
  }

  // 2. Provider-specific dynamic discovery
  if (providerId === "cline-free") {
    try {
      const res = await fetch("https://api.cline.bot/api/v1/ai/cline/recommended-models", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = await res.json();
        const freeList = json.free || [];
        for (const m of freeList) addCandidate(m);
      }
    } catch {}

    try {
      const res = await fetch("https://api.cline.bot/api/v1/models", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json?.data || [];
        for (const m of list) addCandidate(m);
      }
    } catch {}
  } else if (providerId === "kilocode" || providerId === "kilocode-free") {
    try {
      const res = await fetch("https://api.kilo.ai/api/gateway/models", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json?.data) ? json.data : [];
        for (const m of list) {
          if (m.isFree === true || String(m.id).endsWith(":free") || String(m.id).endsWith("-free") || m.id === "kilo-auto/free") {
            addCandidate(m);
          }
        }
      }
    } catch {}
  } else if (providerId === "opencode" || providerId === "opencode-zen") {
    try {
      const res = await fetch("https://opencode.ai/zen/v1/models", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json?.data || [];
        const filterFn = FILTERS["opencode-free"];
        const filtered = filterFn ? filterFn(list) : list;
        for (const m of filtered) addCandidate(m);
      }
    } catch {}
  } else if (pConfig.modelsFetcher?.url && pConfig.modelsFetcher?.type) {
    try {
      const res = await fetch(pConfig.modelsFetcher.url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const json = await res.json();
        const raw = json.data ?? json.models ?? json;
        const filter = FILTERS[pConfig.modelsFetcher.type];
        const data = filter ? filter(Array.isArray(raw) ? raw : []) : (Array.isArray(raw) ? raw : []);
        for (const m of data) addCandidate(m);
      }
    } catch {}
  }

  return Array.from(candidatesMap.values());
}

/**
 * POST /api/providers/[id]/scan-free-models
 * Automatically scan and probe candidate free models for this provider.
 * Uses random active connection credentials with 3x retry on transient errors,
 * and immediate stop/skip on paid (402 / insufficient credit) responses.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const providerId = resolveProviderId(id);
    const pConfig = PROVIDERS[providerId] || {};
    const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;

    const body = await request.json().catch(() => ({}));
    let candidates = body.candidateModels;

    if (!Array.isArray(candidates) || candidates.length === 0) {
      candidates = await fetchCandidatesForProvider(providerId, alias);
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({
        provider: providerId,
        error: "No candidate models found to probe for this provider",
        candidates: [],
        freeModels: [],
        paidModels: [],
        failedModels: [],
      }, { status: 400 });
    }

    // Probe pool = routable accounts only. A connection that is locked, cooling
    // down, or disabled would fail every probe with a 503 pin error, which would
    // be reported as a model failure rather than an account-state artifact.
    const isNoAuth = !!pConfig.noAuth;
    const connections = isNoAuth
      ? []
      : await getAvailableAccountsForRouting({ provider: providerId, limit: 200 });

    if (!isNoAuth && connections.length === 0) {
      const activeCount = (await getProviderConnections({ provider: providerId, isActive: true })).length;
      return NextResponse.json({
        provider: providerId,
        error: activeCount > 0
          ? `All ${activeCount} active connections for "${providerId}" are locked, cooling down, or exhausted. Reset them before scanning.`
          : `No active connections available for provider "${providerId}" to run probes`,
        candidates: [],
        freeModels: [],
        paidModels: [],
        failedModels: [],
      }, { status: 400 });
    }

    // Retries must land on a DIFFERENT account: a failed probe may have locked
    // or cooled the account it used, so re-pinning to it would burn the
    // remaining attempts on a connection already known to be unusable.
    const pickConnection = (excludeIds) => {
      if (connections.length === 0) return null;
      const pool = excludeIds?.size ? connections.filter((c) => !excludeIds.has(c.id)) : connections;
      const source = pool.length > 0 ? pool : connections;
      return source[Math.floor(Math.random() * source.length)];
    };

    const results = [];
    const MAX_RETRIES = 3;

    // Probe models with controlled concurrency of 2 to balance speed and rate limits
    const probeCandidate = async (cand) => {
      const rawModelId = typeof cand === "string" ? cand : cand.id;
      const modelName = (typeof cand === "object" && cand.name) ? cand.name : rawModelId;
      // Strip any duplicate/redundant provider alias from candidate id
      let modelId = rawModelId;
      for (const pfx of [providerId, alias]) {
        if (modelId.startsWith(`${pfx}/`)) {
          modelId = modelId.slice(pfx.length + 1);
          break;
        }
      }
      const fullModel = `${alias}/${modelId}`;

      let lastResult = null;
      let usedConnection = null;
      const triedConnectionIds = new Set();

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        usedConnection = pickConnection(triedConnectionIds);
        const connId = usedConnection?.id || null;
        if (connId) triedConnectionIds.add(connId);
        let pingResult;
        try {
          pingResult = await pingModelByKind(fullModel, "llm", undefined, connId);
        } catch (pingErr) {
          pingResult = {
            ok: false,
            latencyMs: 10000,
            status: 504,
            error: pingErr?.message || "Probe timeout",
          };
        }
        lastResult = pingResult;
        // 1. Success -> Free & Active
        if (pingResult.ok) {
          return {
            id: modelId,
            name: modelName,
            fullModel,
            ok: true,
            isPaid: false,
            latencyMs: pingResult.latencyMs,
            attempts: attempt,
            connectionId: connId,
            connectionName: usedConnection?.name || usedConnection?.email || null,
          };
        }

        // 2. Paid / Insufficient balance -> STOP IMMEDIATELY (no retries)
        if (isPaidError(pingResult.status, pingResult.error)) {
          return {
            id: modelId,
            name: modelName,
            fullModel,
            ok: false,
            isPaid: true,
            status: pingResult.status,
            error: pingResult.error || "Paid model or insufficient credits",
            attempts: attempt,
            connectionId: connId,
            connectionName: usedConnection?.name || usedConnection?.email || null,
          };
        }

        // 3. If timeout / 504, do not burn 3 full attempts on a dead candidate
        if (pingResult.status === 504 || /timeout|timed out/i.test(String(pingResult.error || ""))) {
          break;
        }

        // 4. Transient error (429 rate limit, 500, 502, 503) -> Retry up to 3x
        if (attempt < MAX_RETRIES) {
          await sleep(350 * attempt);
        }
      }

      // Exhausted attempts without a definitive verdict. PINNED_UNAVAILABLE and
      // 504 mean the probe could not reach a usable account, which says nothing
      // about whether the model is free — report it as a failure, not a verdict.
      const accountState = lastResult?.status === 503
        && /PINNED_UNAVAILABLE|not currently routable/i.test(String(lastResult?.error || ""));
      return {
        id: modelId,
        name: modelName,
        fullModel,
        ok: false,
        isPaid: false,
        status: lastResult?.status,
        error: lastResult?.error || "Probe failed after 3 attempts",
        reason: accountState ? "no_routable_account" : (lastResult?.status === 504 ? "timeout" : "upstream_error"),
        attempts: MAX_RETRIES,
        connectionId: usedConnection?.id || null,
        connectionName: usedConnection?.name || usedConnection?.email || null,
      };
    };

    const wantsStream = request.headers.get("accept")?.includes("text/event-stream")
      || request.url.includes("stream=1");

    if (wantsStream) {
      const encoder = new TextEncoder();
      let heartbeat = null;
      let isClosed = false;

      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (event, data) => {
            if (isClosed) return;
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            } catch {
              isClosed = true;
            }
          };

          // Send keepalive comment every 3s to prevent proxy/browser idle socket timeout
          heartbeat = setInterval(() => {
            if (isClosed) {
              if (heartbeat) clearInterval(heartbeat);
              return;
            }
            try {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
            } catch {
              isClosed = true;
              if (heartbeat) clearInterval(heartbeat);
            }
          }, 3000);

          try {
            sendEvent("start", {
              provider: providerId,
              alias,
              totalCandidates: candidates.length,
            });

            const STREAM_CHUNK_SIZE = 4;
            const probeAndEmit = async (cand) => {
              const r = await probeCandidate(cand);
              if (!isClosed) {
                results.push(r);
                sendEvent("probe", {
                  ...r,
                  testedCount: results.length,
                  totalCandidates: candidates.length,
                });
              }
            };
            for (let i = 0; i < candidates.length; i += STREAM_CHUNK_SIZE) {
              if (isClosed) break;
              const chunk = candidates.slice(i, i + STREAM_CHUNK_SIZE);
              await Promise.all(chunk.map((c) => probeAndEmit(c)));
              if (i + STREAM_CHUNK_SIZE < candidates.length && !isClosed) {
                await sleep(50);
              }
            }

            if (!isClosed) {
              const streamFree = results.filter((r) => r.ok);
              const streamPaid = results.filter((r) => r.isPaid);
              const streamFailed = results.filter((r) => !r.ok && !r.isPaid);

              sendEvent("done", {
                provider: providerId,
                alias,
                totalCandidates: candidates.length,
                testedCount: results.length,
                freeModels: streamFree,
                paidModels: streamPaid,
                failedModels: streamFailed,
                results,
              });

              isClosed = true;
              controller.close();
            }
          } catch (streamErr) {
            console.error("[scan-free-models] stream error:", streamErr);
            if (!isClosed) {
              sendEvent("error", { error: streamErr?.message || "Stream error" });
              isClosed = true;
              try { controller.close(); } catch {}
            }
          } finally {
            if (heartbeat) clearInterval(heartbeat);
          }
        },
        cancel() {
          isClosed = true;
          if (heartbeat) clearInterval(heartbeat);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Run probes in chunks of 2
    const CHUNK_SIZE = 2;
    for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
      const chunk = candidates.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(chunk.map((c) => probeCandidate(c)));
      results.push(...chunkResults);
      if (i + CHUNK_SIZE < candidates.length) {
        await sleep(200);
      }
    }

    const freeModels = results.filter((r) => r.ok);
    const paidModels = results.filter((r) => r.isPaid);
    const failedModels = results.filter((r) => !r.ok && !r.isPaid);

    return NextResponse.json({
      provider: providerId,
      alias,
      totalCandidates: candidates.length,
      testedCount: results.length,
      freeModels,
      paidModels,
      failedModels,
      results,
    });
  } catch (error) {
    console.error("Error in scan-free-models route:", error);
    return NextResponse.json({ error: error.message || "Failed to scan free models" }, { status: 500 });
  }
}

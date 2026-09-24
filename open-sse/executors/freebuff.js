import crypto from "node:crypto";
import { BaseExecutor, abortableSleep } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { dbg } from "../utils/debugLog.js";
import {
  FETCH_CONNECT_TIMEOUT_MS,
  DEFAULT_RETRY_CONFIG,
  resolveRetryEntry,
} from "../config/runtimeConfig.js";
import { markPoolUnfit, clearPoolUnfit } from "../services/proxyPoolFitness.js";
import { getCodebuffUserAgent } from "../services/freebuffVersion.js";

/**
 * Freebuff Executor — OpenAI-compatible chat completions on
 * https://www.codebuff.com/api/v1/chat/completions (the Codebuff/Freebuff backend).
 *
 * Wire shape mirrors the official CLI exactly. The CLI (Vercel AI SDK with the
 * codebuff openai-compatible provider) builds `providerOptions.codebuff` =
 * { codebuff_metadata, provider } and the provider spreads those entries at
 * the TOP LEVEL of the request body — i.e. the body is:
 *   { model, messages, codebuff_metadata: { run_id, client_id, cost_mode,
 *     freebuff_instance_id? }, provider: { allow_fallbacks } }
 * NOT nested under a `codebuff` object (the backend rejects the nested shape
 * with 400 "No runId found in request body").
 *
 * The run_id is not a free-form uuid: the backend resolves it against its
 * agent-run store and rejects unknown ids with 400 "runId Not Found". So every
 * chat request first registers a run via POST /api/v1/agent-runs
 * ({ action:"START", agentId, ancestorRunIds:[] }) → { runId }, and that id is
 * what goes in codebuff_metadata.run_id. The free tier additionally gates on a
 * session: POST /api/v1/freebuff/session with an `x-freebuff-model` header
 * claims a row (bound to one model, ~1h); its instance id must ride along as
 * codebuff_metadata.freebuff_instance_id.
 */
const SESSION_PATH = "/api/v1/freebuff/session";
const RUN_PATH = "/api/v1/agent-runs";
const SESSION_DEFAULT_TTL_MS = 60 * 60 * 1000; // active sessions live ~1h

// A terminal account state (403 banned / country_blocked) is re-confirmed at
// most once per day: the server sweeps and can reverse wrongful bans, so a
// long re-check window keeps us self-healing while still sending ~zero traffic
// to a dead account (mirrors the official CLI: terminal, stop polling).
const BANNED_ACCOUNT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Chat statuses that mean our claimed session is stale and must be re-claimed
// before retrying (mirrors the CLI's FreebuffGateErrorKind statuses).
const SESSION_STALE_CODES = new Set([428, 409, 410]);

// Models the backend runs as a CAPACITY-LIMITED OFFER rather than a standing
// picker row. Claude Fable 5 is not in the client catalog at all: the server
// advertises it per-session-response (`limitedModelOffers`) only while its
// shared wave pool has sessions left, and a request without a live offer is
// refused. A claim must therefore peek at the current offers first instead of
// POSTing blind (mirrors the CLI: the "Claude Fable 5 · N of M left" row only
// renders from that payload). Offer state is per-account and cached briefly —
// the pool can reopen at any time, so a closed offer must NOT set a long
// cooldown.
const OFFER_GATED_MODELS = new Set(["anthropic/claude-fable-5"]);
const OFFER_CACHE_TTL_MS = 45_000;

// The free tier rejects requests whose first system message doesn't open with
// the canonical Freebuff CLI root prompt (server gate
// requestHasFreebuffSystemMarker → 403 free_mode_cli_required). The check is a
// byte-exact prefix test on position 0, so we prepend the canonical opening.

const FREEBUFF_SYSTEM_MARKER = "You are Buffy, the strategic coding assistant.";

// Canonical openings accepted by the server gate (mirrors the CLI's
// FREEBUFF_ROOT_SYSTEM_PROMPT_OPENINGS). The check is a byte-exact prefix on
// the first message, so our injected marker must be one of these verbatim.
const FREEBUFF_ROOT_SYSTEM_OPENINGS = [
  "You are Buffy, the strategic coding assistant.",
  "You are Buffy, the Freebuff Cloud project planner.",
  "You are Buffy, a strategic assistant that orchestrates complex coding tasks through specialized sub-agents.",
];

// Ensure messages[0] opens with a canonical Freebuff root prompt (idempotent).
function injectFreebuffMarker(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return body;
  const first = messages[0];
  if (first?.role === "system" && typeof first.content === "string") {
    const trimmed = first.content.trimStart();
    if (FREEBUFF_ROOT_SYSTEM_OPENINGS.some((opening) => trimmed.startsWith(opening))) return body; // already marked
    // Prepend the canonical opening to the existing system prompt so it stays
    // the first thing the model reads (keep the rest of the messages intact).
    return {
      ...body,
      messages: [{ ...first, content: `${FREEBUFF_SYSTEM_MARKER}\n\n${first.content}` }, ...messages.slice(1)],
    };
  }
  // No leading system message — insert one with the canonical opening.
  return { ...body, messages: [{ role: "system", content: FREEBUFF_SYSTEM_MARKER }, ...messages] };
}

// The backend's foreign_toolset gate rejects any tool-calling request whose
// toolset lacks the CLI's `end_turn` tool with a misleading 404 "No endpoints
// found for {model}" (verified live 2026-08-14; the freebuff-proxy bridge
// works around the same gate by injecting this definition). Every request that
// declares tools must carry it or the router finds no serving endpoint.
const END_TURN_TOOL = {
  type: "function",
  function: {
    name: "end_turn",
    description: "Signal the end of the current task.",
    parameters: { type: "object", properties: {} },
  },
};

function injectEndTurnTool(body) {
  const tools = body?.tools;
  if (!Array.isArray(tools) || tools.length === 0) return body;
  const hasEndTurn = tools.some(
    (t) => t?.function?.name === "end_turn",
  );
  if (hasEndTurn) return body;
  return { ...body, tools: [...tools, END_TURN_TOOL] };
}

// Freebuff root agent id per model (mirrors the CLI's
// FREEBUFF_CLI_BASE3_AGENT_ID_BY_MODEL — the CLI harness moved from base2 to
// base3, and the backend can return 404 "No endpoints found" for the old
// base2 roots during the transition).
const FREE_ROOT_AGENT_BY_MODEL = {
  "z-ai/glm-5.2": "base3-free-glm",
  "z-ai/glm-5.3-flash": "base3-free-glm-5-3-flash",
  "deepseek/deepseek-v4-flash": "base3-free-deepseek-flash",
  "mimo/mimo-v2.5": "base3-free-mimo",
  "openai/gpt-5.6-luna": "base3-free-luna",
  "upstage/solar-pro4": "base3-free-solar-pro4",
  "meta/muse-spark-1.2-contributor": "base3-free-muse-spark",
  "anthropic/claude-fable-5": "base3-free-fable",
  // Retain roots for sessions from released clients while paused/retired models drain.
  "deepseek/deepseek-v4-pro": "base3-free-deepseek",
  "minimax/minimax-m3": "base3-free-minimax-m3",
};
// Session admission-gate statuses (both HTTP 200 pre-join refusals and 4xx
// envelopes carry these in data.status).
const GATE_MESSAGES = {
  country_blocked: "Freebuff is not available in your region (country blocked).",
  banned: "Your Freebuff account has been banned.",
  ip_capped: "Freebuff IP cap reached — try again later.",
  rate_limited: "Freebuff session limit reached for this model — try again later.",
  spend_limited: "Freebuff spend limit reached — add credits or wait for the window to reset.",
  model_locked: "Freebuff session is locked to another model — end it in the CLI or wait for it to expire.",
  model_unavailable: "This model is not available on Freebuff right now.",
  premium_slot_taken: "Freebuff premium slot is taken — try another model.",
};


// Per-token+model session cache (in-memory; keyed so multi-account setups
// don't share one session row). Re-claims are driven by the cache expiring or
// by a 428 from chat — no early re-claim, so we never POST /session while our
// own row is still active (which could come back as a spurious model_locked).
// All state lives on globalThis so Next dev (Turbopack) bundles share ONE copy.
const FB_STATE_KEY = "__axonrouterFreebuffState__";
const fbState = (globalThis[FB_STATE_KEY] ??= {
  sessionCache: new Map(),      // `${token}::${model}` -> { instanceId, expiresAt }
  inflight: new Map(),          // dedupe concurrent claims for the same key
  modelLockCooldowns: new Map(), // `${token}::${model}` -> expiresAt (ms)
  poolLimitCooldowns: new Map(), // `${proxyKey}::${model}` -> expiresAt (ms)
  offerCache: new Map(),        // `${token}` -> { fetchedAt, offers: [] } (limited-offer rows)
  bannedUntil: new Map(),       // `${token}` -> expiresAt (ms) — terminal banned/blocked accounts
});
const sessionCache = fbState.sessionCache;
const inflight = fbState.inflight;
const modelLockCooldowns = fbState.modelLockCooldowns;
const poolLimitCooldowns = fbState.poolLimitCooldowns;
const offerCache = fbState.offerCache;
const bannedUntil = fbState.bannedUntil;

const MODEL_LOCK_COOLDOWN_MS = 10 * 60 * 1000; // session bound to another model (~1h) — re-check every 10 min
const POOL_LIMITED_COOLDOWN_MS = 5 * 60 * 1000; // IP tier refuses this model — try a different pool/relay

// Cooldown maps need pruning: expired entries are cleared on write (sweep) and
// on read, so long-running servers don't accumulate one entry per (account,model)
// / (proxy,model) forever.
function setCooldown(map, key, until) {
  const now = Date.now();
  for (const [k, v] of map) {
    if (v <= now) map.delete(k);
  }
  map.set(key, until);
}

function getCooldown(map, key) {
  const until = map.get(key);
  if (until == null) return null;
  if (until <= Date.now()) {
    map.delete(key);
    return null;
  }
  return until;
}

function proxyKeyOf(proxyOptions) {
  return proxyOptions?.vercelRelayUrl || proxyOptions?.connectionProxyUrl || "direct";
}

function sessionGateFromText(text) {
  const raw = String(text || "");
  let parsed = {};
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  if (
    parsed.accessTier === "limited" ||
    parsed.accesstier === "limited" ||
    parsed.pool === "freebucks" ||
    parsed.error === "limited_ip" ||
    parsed.status === "limited_ip" ||
    parsed.error === "freebucks" ||
    /accesstier["']?\s*:\s*["']limited|["']pool["']?\s*:\s*["']freebucks/i.test(raw)
  ) {
    return { kind: "limited_ip" };
  }
  return classifySessionGate(
    parsed.error || parsed.error_type || parsed.status || "",
    parsed.message || "",
    parsed.currentModel || null,
    parsed,
  );
}

// Parse a 409/428/410 body into { kind, currentModel }. `msg` may be a whole
// error string containing a JSON tail (requestSession errors embed the body).
// A structured code set by requestSession (terminal/ban/quota gates thrown
// with err.code) wins before any JSON tail sniffing.
function sessionGateFromError(error) {
  if (error?.code) {
    if (error.code === "model_locked") return { kind: "model_locked", currentModel: error.currentModel };
    if (error.code === "banned") return { kind: "banned" };
    if (error.code === "country_blocked") return { kind: "country_blocked" };
    if (error.code === "limited_ip" || error.code === "ip_capped" || error.code === "freebucks") {
      return { kind: "limited_ip" };
    }
    if (error.code === "free_mode_unavailable") return { kind: "free_mode_unavailable" };
    if (error.code === "rate_limited" || error.code === "spend_limited") {
      const msg = String(error?.message || "");
      if (
        error.accessTier === "limited" ||
        error.pool === "freebucks" ||
        /accesstier["']?\s*:\s*["']limited|["']pool["']?\s*:\s*["']freebucks|limited_ip/i.test(msg)
      ) {
        return { kind: "limited_ip" };
      }
      return { kind: "quota", resetsAtMs: error.resetsAtMs };
    }
  }
  if (error?.freebuffKind === "limited_ip") return { kind: "limited_ip" };
  if (error?.freebuffKind === "free_mode_unavailable") return { kind: "free_mode_unavailable" };

  const msg = String(error?.message || "");
  const start = msg.indexOf("{");
  if (start >= 0) {
    try {
      const parsed = JSON.parse(msg.slice(start));
      if (
        parsed.accessTier === "limited" ||
        parsed.accesstier === "limited" ||
        parsed.pool === "freebucks" ||
        parsed.error === "limited_ip" ||
        parsed.status === "limited_ip" ||
        parsed.error === "freebucks" ||
        /accesstier["']?\s*:\s*["']limited|["']pool["']?\s*:\s*["']freebucks/i.test(msg)
      ) {
        return { kind: "limited_ip" };
      }
      return classifySessionGate(
        parsed.error || parsed.error_type || parsed.status || "",
        parsed.message || "",
        parsed.currentModel || null,
        parsed,
      );
    } catch {
      // fall through
    }
  }
  if (/accesstier["']?\s*:\s*["']limited|["']pool["']?\s*:\s*["']freebucks|limited_ip/i.test(msg)) {
    return { kind: "limited_ip" };
  }
  return null;
}

function classifySessionGate(code, message, currentModel, meta = null) {
  if (typeof code === "object" && code !== null) {
    meta = code;
    code = meta.error || meta.error_type || meta.status || "";
    message = meta.message || "";
    currentModel = meta.currentModel || null;
  }
  const codeStr = String(code || "").toLowerCase();
  const accessTier = String(meta?.accessTier || meta?.accesstier || "").toLowerCase();
  const pool = String(meta?.pool || "").toLowerCase();
  const metaStr = meta ? JSON.stringify(meta) : "";
  const msgStr = String(message || "");

  if (codeStr === "banned") return { kind: "banned" };
  if (codeStr === "country_blocked") return { kind: "country_blocked" };
  if (codeStr === "session_superseded") return { kind: "superseded" };
  if (codeStr === "model_locked") return { kind: "model_locked", currentModel };

  // Check limited tier / IP cap before quota
  if (
    codeStr === "limited_ip" ||
    codeStr === "ip_capped" ||
    codeStr === "freebucks" ||
    accessTier === "limited" ||
    pool === "freebucks" ||
    /limited/i.test(msgStr) ||
    /freebucks/i.test(msgStr) ||
    /accesstier["']?\s*:\s*["']limited|["']pool["']?\s*:\s*["']freebucks/i.test(metaStr)
  ) {
    return { kind: "limited_ip" };
  }

  // IP-tier refusals (limited-tier mismatch, anonymous_network proxy, or per-IP cap)
  // are the egress's fault — pool fitness must see them so the bad relay/IP stops being reused.
  if (codeStr === "free_mode_unavailable" || /anonymous_network|proxy traffic/i.test(msgStr)) {
    return { kind: "free_mode_unavailable" };
  }
  if (codeStr === "rate_limited" || codeStr === "spend_limited") return { kind: "quota" };
  // session_model_mismatch with the limited-tier message is an IP-tier refusal;
  // without it (or unknown) treat it as a model lock so we don't reclaim in a loop.
  if (codeStr === "session_model_mismatch") {
    return /limited/i.test(msgStr)
      ? { kind: "limited_ip" }
      : { kind: "model_locked", currentModel };
  }
  return { kind: "stale" }; // 428/410/unknown → reclaim
}

// Applies cooldowns and throws for non-reclaimable gates. Never returns for them.
function throwSessionGateError(gate, { token, model, proxyKey, poolId, log }) {
  if (gate.kind === "banned" || gate.kind === "country_blocked") {
    const until = Date.now() + BANNED_ACCOUNT_COOLDOWN_MS;
    setCooldown(bannedUntil, token, until);
    const err = new Error(
      gate.kind === "banned"
        ? "Your Freebuff account has been banned (403) — this account is no longer usable. Remove it and connect a new Freebuff account."
        : "Freebuff is not available in your region (country blocked).",
    );
    err.status = 403;
    err.code = gate.kind;
    err.terminalAccount = true;
    err.resetsAtMs = until;
    log?.warn?.("AUTH", `Freebuff account ${gate.kind} (token=${token.slice(0, 8)}…) — terminal; no further upstream calls for ${BANNED_ACCOUNT_COOLDOWN_MS / 3600000}h`);
    throw err;
  }
  if (gate.kind === "quota") {
    // Daily session quota exhausted. Lock token+model until the upstream
    // resetAt (Pacific day/week) so we never poke an exhausted account —
    // mirrors trefeon's zero-spam quota lock. Falls back to ~1h when the
    // body carries no resetAt.
    const resetsAtMs = gate.resetsAtMs && gate.resetsAtMs > Date.now()
      ? gate.resetsAtMs
      : Date.now() + 60 * 60 * 1000;
    const err = new Error(
      `Freebuff daily session quota exhausted for ${model} — try again after ${new Date(resetsAtMs).toLocaleString()}.`,
    );
    err.status = 429;
    err.code = "rate_limited";
    err.resetsAtMs = resetsAtMs;
    log?.warn?.("AUTH", `Freebuff quota exhausted (${model}) — locked until ${new Date(resetsAtMs).toLocaleString()}`);
    throw err;
  }
  if (gate.kind === "model_locked") {
    const until = Date.now() + MODEL_LOCK_COOLDOWN_MS;
    setCooldown(modelLockCooldowns, `${token}::${model}`, until);
    const label = gate.currentModel ? `"${gate.currentModel}"` : "another model";
    const err = new Error(
      `Freebuff session is locked to ${label} — it cannot serve ${model}. End the session on freebuff.com or wait for it to expire (~1h).`,
    );
    err.status = 409;
    err.resetsAtMs = until;
    log?.warn?.("AUTH", `Freebuff model_locked (session=${label}, requested=${model}) — model cooldown ${MODEL_LOCK_COOLDOWN_MS / 60000}min`);
    throw err;
  }
  if (gate.kind === "free_mode_unavailable") {
    const until = Date.now() + POOL_LIMITED_COOLDOWN_MS;
    setCooldown(poolLimitCooldowns, `${proxyKey}::${model}`, until);
    const scope = `freebuff::${model}`;
    if (poolId) markPoolUnfit(poolId, scope, until, "free_mode_unavailable");
    const err = new Error(
      `Freebuff free mode unavailable from this proxy egress (anonymous_network) — rotating proxy.`,
    );
    err.status = 403;
    err.freebuffKind = "free_mode_unavailable";
    err.poolScoped = { poolId, scope, reason: "free_mode_unavailable" };
    log?.warn?.("AUTH", `Freebuff free_mode_unavailable on proxy (${proxyKey.slice(0, 40)}…) — pool unfit for ${POOL_LIMITED_COOLDOWN_MS / 60000}min`);
    throw err;
  }
  if (gate.kind === "limited_ip") {
    const until = Date.now() + POOL_LIMITED_COOLDOWN_MS;
    setCooldown(poolLimitCooldowns, `${proxyKey}::${model}`, until);
    const scope = `freebuff::${model}`;
    if (poolId) markPoolUnfit(poolId, scope, until, "limited_ip");
    // Pool-scoped, not account-scoped: the caller retries via another pool
    // instead of locking the account (resetsAtMs intentionally absent).
    const err = new Error(
      `Freebuff limited-mode IP rejected ${model} — rotating proxy.`,
    );
    err.status = 429;
    err.code = "limited_ip";
    err.freebuffKind = "limited_ip";
    err.cooldownMs = 30000;
    err.poolScoped = { poolId, scope, reason: "limited_ip" };
    log?.warn?.("AUTH", `Freebuff limited-IP refused ${model} (proxy=${proxyKey.slice(0, 40)}…) — cooldown ${POOL_LIMITED_COOLDOWN_MS / 60000}min`);
    throw err;
  }
}

function sessionOrigin() {
  return new URL(PROVIDERS.freebuff.baseUrl).origin; // https://www.codebuff.com
}

// A network/connect failure while egressing through a relay/pool is the
// egress's fault (dead relay, unreachable worker), not the account's — declare
// it pool-scoped so chatCore marks the pool unfit and retries via another
// pool instead of reusing the dead one. Gate errors (401/403/409/429 with
// err.status) are never relay failures. No-op when not on a pool/relay.
function markRelayFailure(err, proxyOptions) {
  // Gate errors carry an HTTP status or a string code; DOMException has a
  // numeric legacy .code (e.g. 20 = AbortError) which must NOT be treated as
  // a gate code. Genuine caller/stream aborts are never relay failures —
  // only OUR connect-timeout abort (silent stall) counts.
  if (err?.status != null || typeof err?.code === "string") return err;
  if (err?.name === "AbortError" && !isConnectTimeoutAbort(err)) return err;
  if (!proxyOptions?.proxyPoolId && !proxyOptions?.vercelRelayUrl) return err;
  err.poolScoped = { reason: "relay_unreachable" };
  return err;
}

// Distinguish OUR connect-timeout abort (the relay held the connection without
// answering — a silent stall) from a genuine caller/stream abort. The timeout
// timer aborts with an Error reason carrying "fetch connect timeout".
function isConnectTimeoutAbort(error) {
  if (error?.name !== "AbortError") return false;
  const msg = String(error?.cause?.message || error?.message || "");
  return /fetch connect timeout/i.test(msg);
}

function sessionCacheKey(token, model) {
  return `${token}::${model}`;
}

export function canonicalFreebuffModel(model) {
  if (!model) return model;
  const clean = String(model).replace(/^(freebuff|fb)\//i, "");
  if (FREE_ROOT_AGENT_BY_MODEL[clean]) return clean;
  for (const canonical of Object.keys(FREE_ROOT_AGENT_BY_MODEL)) {
    if (canonical.endsWith(`/${clean}`) || canonical === clean) {
      return canonical;
    }
  }
  return clean;
}

function rootAgentIdForModel(model) {
  const canonical = canonicalFreebuffModel(model);
  return FREE_ROOT_AGENT_BY_MODEL[canonical] || "base2-free";
}

// Retry transient network errors (ECONNRESET, TLS reset, …) on the session/
// run API calls — mirrors the CLI's fetchWithRetry. Only fetch-level throws
// are retried; HTTP error responses are returned as-is.
//
// The timeout signal is built per attempt: a single shared
// AbortSignal.timeout() would stay aborted forever after it fires, silently
// turning attempts 2..n into instant no-op rejections.
async function fetchWithNetworkRetry(url, options, proxyOptions, attempts = 3, timeoutMs = FETCH_CONNECT_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const opts = { ...options, signal: AbortSignal.timeout(timeoutMs) };
      return await proxyAwareFetch(url, opts, proxyOptions);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
  }
  throw lastError;
}

async function requestSession(token, rawModel, proxyOptions) {
  const model = canonicalFreebuffModel(rawModel);
  // Offer-gated models (Fable) refuse claims while their wave pool is closed —
  // checked before the POST so a closed offer never burns a claim attempt.
  await guardOfferClaim(token, model, proxyOptions);

  const response = await fetchWithNetworkRetry(`${sessionOrigin()}${SESSION_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": getCodebuffUserAgent(),
      "x-freebuff-model": model,
    },
  }, proxyOptions);

  let data = {};
  try { data = await response.json(); } catch { data = {}; }

  if (response.status === 401) {
    const err = new Error("Freebuff session auth failed (401) — re-login in the dashboard");
    err.status = 401;
    throw err;
  }
  if (!response.ok) {
    const statusText = String(data?.status || "").toLowerCase();
    if (statusText === "banned") {
      const err = new Error(`Freebuff account banned (403): ${JSON.stringify(data).slice(0, 200)}`);
      err.status = 403;
      err.freebuffKind = "banned";
      throw err;
    }
    if (statusText === "country_blocked") {
      const err = new Error("Freebuff is not available in your region (country blocked).");
      err.status = 403;
      err.freebuffKind = "country_blocked";
      err.poolScoped = {
        poolId: proxyOptions?.proxyPoolId || null,
        scope: `freebuff::${model}`,
        reason: "country_blocked",
      };
      throw err;
    }
    // Proxy-egress refusal (NOT an account fault): upstream rejects anonymous/
    // proxy traffic with `free_mode_unavailable` + `anonymous_network`. Mark the
    // pool unfit so chatCore rotates to another proxy instead of locking the
    // account. Message deliberately avoids the "session request failed: 403"
    // prefix so the 3-day lockAll rule in ERROR_RULES can never match it.
    const errorName = String(data?.error || "").toLowerCase();
    const bodyText = JSON.stringify(data || {});
    if (statusText === "free_mode_unavailable" || errorName === "free_mode_unavailable"
      || /anonymous_network|proxy traffic/i.test(bodyText)) {
      const err = new Error(`Freebuff free mode unavailable from this proxy egress (anonymous_network) — rotating proxy. ${bodyText.slice(0, 160)}`);
      err.status = 403;
      err.code = "free_mode_unavailable";
      err.freebuffKind = "free_mode_unavailable";
      err.poolScoped = {
        poolId: proxyOptions?.proxyPoolId || null,
        scope: `freebuff::${model}`,
        reason: "free_mode_unavailable",
      };
      throw err;
    }

    if (
      statusText === "rate_limited" ||
      errorName === "rate_limited" ||
      response.status === 429
    ) {
      if (
        data?.accessTier === "limited" ||
        data?.pool === "freebucks" ||
        bodyText.includes('"accessTier":"limited"') ||
        bodyText.includes('"pool":"freebucks"')
      ) {
        const err = new Error(`Freebuff limited tier rate limited on this proxy (limited accessTier/freebucks) — rotating proxy. ${bodyText.slice(0, 160)}`);
        err.status = 429;
        err.code = "limited_ip";
        err.freebuffKind = "limited_ip";
        err.poolScoped = {
          poolId: proxyOptions?.proxyPoolId || null,
          scope: `freebuff::${model}`,
          reason: "limited_ip",
        };
        err.cooldownMs = 30000;
        throw err;
      }
    }
    // Gate statuses ride BOTH 200 (pre-join refusals) and 4xx — the backend
    // sends spend_limited/rate_limited as HTTP 429 with the gate in the body.
    // Handle them BEFORE the generic !ok throw so exhaustion carries
    // resetsAtMs (skip-until-reset) instead of a bare status.
    const gateStatus = String(data?.status || "");
    if (GATE_MESSAGES[gateStatus]) {
      const gateMessage = data?.message ? `${GATE_MESSAGES[gateStatus]} ${data.message}` : GATE_MESSAGES[gateStatus];
      const gateErr = new Error(gateMessage);
      if (gateStatus === "rate_limited" || gateStatus === "spend_limited") {
        const resetAt = Date.parse(data?.resetAt || "");
        const retryAfter = Number(data?.retryAfterMs);
        if (Number.isFinite(resetAt) && resetAt > Date.now()) {
          gateErr.status = 429;
          gateErr.resetsAtMs = resetAt;
        } else if (Number.isFinite(retryAfter) && retryAfter > 0) {
          gateErr.status = 429;
          gateErr.resetsAtMs = Date.now() + Math.min(retryAfter, 26 * 60 * 60 * 1000);
        }
      }
      throw gateErr;
    }
    const err = new Error(`Freebuff session request failed: ${response.status} ${JSON.stringify(data).slice(0, 200)}`);
    err.status = response.status;
    throw err;
  }

  const status = data?.status;
  if (status === "active") {
    const parsedExp = Date.parse(data.expiresAt || "");
    const entry = {
      instanceId: data.instanceId,
      expiresAt: Number.isFinite(parsedExp) ? parsedExp : Date.now() + SESSION_DEFAULT_TTL_MS,
    };
    sessionCache.set(sessionCacheKey(token, model), entry);
    return { instanceId: data.instanceId, status: "active" };
  }
  if (status === "none") {
    // Not session-gated right now — proceed without an instance id; a 428 on
    // chat tells us the admission gate actually requires a session.
    return { instanceId: null, status: "none" };
  }

  if (status === "rate_limited") {
    const bodyText = JSON.stringify(data || {});
    if (
      data?.accessTier === "limited" ||
      data?.pool === "freebucks" ||
      bodyText.includes('"accessTier":"limited"') ||
      bodyText.includes('"pool":"freebucks"')
    ) {
      const err = new Error(`Freebuff limited tier rate limited on this proxy (limited accessTier/freebucks) — rotating proxy. ${bodyText.slice(0, 160)}`);
      err.status = 429;
      err.code = "limited_ip";
      err.freebuffKind = "limited_ip";
      err.poolScoped = {
        poolId: proxyOptions?.proxyPoolId || null,
        scope: `freebuff::${model}`,
        reason: "limited_ip",
      };
      err.cooldownMs = 30000;
      throw err;
    }
  }
  if (GATE_MESSAGES[status]) {
    const message = data?.message ? `${GATE_MESSAGES[status]} ${data.message}` : GATE_MESSAGES[status];
    const err = new Error(message);
    if (status === "rate_limited" || status === "spend_limited") {
      const resetAtMs = Date.parse(data?.resetAt || "");
      const retryAfterMs = Number(data?.retryAfterMs);
      if (Number.isFinite(resetAtMs) && resetAtMs > Date.now()) {
        err.status = 429;
        err.resetsAtMs = resetAtMs;
      } else if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
        err.status = 429;
        err.resetsAtMs = Date.now() + Math.min(retryAfterMs, 26 * 60 * 60 * 1000);
      }
    }
    if (status === "banned" || status === "country_blocked") {
      err.status = 403;
      err.freebuffKind = status;
      if (status === "country_blocked") {
        err.poolScoped = {
          poolId: proxyOptions?.proxyPoolId || null,
          scope: `freebuff::${model}`,
          reason: "country_blocked",
        };
      }
    }
    throw err;
  }
  throw new Error(`Freebuff session rejected (${status || response.status}): ${JSON.stringify(data).slice(0, 200)}`);
}

// Fetch the account's current limited-model offers (GET — never claims).
// Cached per token for OFFER_CACHE_TTL_MS: the wave pool changes on server
// time, not ours, and a claim only needs to know "is it open right now".
async function fetchSessionOffers(token, proxyOptions) {
  const now = Date.now();
  const cached = offerCache.get(token);
  if (cached && now - cached.fetchedAt < OFFER_CACHE_TTL_MS) {
    return cached.offers;
  }

  const response = await fetchWithNetworkRetry(`${sessionOrigin()}${SESSION_PATH}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": getCodebuffUserAgent(),
      Accept: "application/json",
    },
  }, proxyOptions);

  let data = {};
  try { data = await response.json(); } catch { data = {}; }

  if (response.status === 401) {
    const err = new Error("Freebuff session auth failed (401) — re-login in the dashboard");
    err.status = 401;
    throw err;
  }
  if (!response.ok) {
    const err = new Error(`Freebuff offer check failed: ${response.status} ${JSON.stringify(data).slice(0, 200)}`);
    err.status = response.status;
    throw err;
  }

  const offers = Array.isArray(data?.limitedModelOffers)
    ? data.limitedModelOffers.filter((o) => o && typeof o.model === "string")
    : [];
  offerCache.set(token, { fetchedAt: now, offers });
  return offers;
}

// For an offer-gated model (Fable), refuse the claim BEFORE the POST when the
// backend is not currently advertising it. Returns the matching offer when the
// claim may proceed. Throws a plain Error (no JSON tail) so the executor's
// sessionGateFromError stays null and the cooldown maps are never touched —
// a closed offer is availability, not a lock, and the pool can reopen any time.
async function guardOfferClaim(token, model, proxyOptions) {
  if (!OFFER_GATED_MODELS.has(model)) return null;

  const offers = await fetchSessionOffers(token, proxyOptions);
  const offer = offers.find((o) => o.model === model);
  if (!offer || !Number.isFinite(Number(offer.remaining)) || Number(offer.remaining) <= 0) { const err = new Error(
    `Claude Fable 5 is not being offered right now — it is a capacity-limited trial served in waves, and freebuff's shared Fable pool is currently empty. Watch the official freebuff CLI for the "Claude Fable 5 · N of M left" row, or retry later.`,
  );
  err.status = 409;
  err.code = "offer_closed";
  throw err; }
  const userLeft = offer.userRemaining == null ? NaN : Number(offer.userRemaining)
  if (Number.isFinite(userLeft) && userLeft <= 0) {
    const resetAt = Date.parse(offer.userResetAt || "");
    const err = new Error(
      `Your Freebuff account has used its Claude Fable 5 sessions for today (pool: ${offer.remaining} of ${offer.total} left)${Number.isFinite(resetAt) ? ` — next slot ${new Date(resetAt).toLocaleString()}` : ""}.`,
    );
    err.status = 409;
    err.code = "offer_user_capped";
    if (Number.isFinite(resetAt)) err.resetsAtMs = resetAt;
    throw err;
  }
  return offer;
}

async function ensureSession(token, rawModel, proxyOptions, force = false) {
  const model = canonicalFreebuffModel(rawModel);
  const key = sessionCacheKey(token, model);
  // Lazy prune: drop stale rows so the cache never accumulates expired entries.
  const cached = sessionCache.get(key);
  if (cached && cached.expiresAt <= Date.now()) {
    sessionCache.delete(key);
  }
  if (!force && cached && cached.expiresAt > Date.now()) {
    return { instanceId: cached.instanceId, status: "active" };
  }
  if (force) {
    // Drop both the cached row and any in-flight claim so the fresh POST can't
    // race a stale one back into the cache.
    sessionCache.delete(key);
    inflight.delete(key);
    return requestSession(token, model, proxyOptions);
  }
  if (!inflight.has(key)) {
    inflight.set(key, requestSession(token, model, proxyOptions).finally(() => inflight.delete(key)));
  }
  return inflight.get(key);
}

// Register an agent run so the chat backend can resolve the run_id we send.
async function startRun(token, rawModel, proxyOptions) {
  const model = canonicalFreebuffModel(rawModel);
  const response = await fetchWithNetworkRetry(`${sessionOrigin()}${RUN_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": getCodebuffUserAgent(),
    },
    body: JSON.stringify({
      action: "START",
      agentId: rootAgentIdForModel(model),
      ancestorRunIds: [],
    }),
  }, proxyOptions);

  const text = await response.text().catch(() => "");
  let data = {};
  try { data = JSON.parse(text); } catch { data = {}; }

  if (response.status === 401) {
    const err = new Error("Freebuff run auth failed (401) — re-login in the dashboard");
    err.status = 401;
    throw err;
  }
  if (!response.ok) {
    const err = new Error(`Freebuff run start failed: ${response.status} ${text.slice(0, 200)}`);
    err.status = response.status;
    throw err;
  }
  if (!data?.runId) {
    throw new Error(`Freebuff run start returned no runId: ${text.slice(0, 200)}`);
  }
  return data.runId;
}

// Best-effort run completion — mirrors the CLI's finishAgentRun. Never throws.
async function finishRun(token, runId, status, proxyOptions) {
  if (!runId) return;
  try {
    await proxyAwareFetch(`${sessionOrigin()}${RUN_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": getCodebuffUserAgent(),
      },
      body: JSON.stringify({ action: "FINISH", runId, status }),
      signal: AbortSignal.timeout(10_000),
    }, proxyOptions);
  } catch {
    // Best-effort only — the server sweeps stale runs.
  }
}

export function resetSessionCache() {
  sessionCache.clear();
  inflight.clear();
  offerCache.clear();
}

// Snapshot sizes of in-memory freebuff state (for the dashboard memory panel).
export function sessionStateSize() {
  return {
    sessions: sessionCache.size,
    inflight: inflight.size,
    modelLocks: modelLockCooldowns.size,
    poolLimits: poolLimitCooldowns.size,
    offerCaches: offerCache.size,
  };
}

// Periodic sweeper: drop stale session rows + expired cooldowns so long-running
// servers never accumulate state for accounts/models no longer in use.
// Returns how many entries were removed.
export function pruneSessionState(now = Date.now()) {
  let removed = 0;
  for (const [key, entry] of sessionCache) {
    if (entry?.expiresAt && entry.expiresAt <= now) {
      sessionCache.delete(key);
      removed += 1;
    }
  }
  for (const [key, entry] of offerCache) {
    if (now - entry.fetchedAt >= OFFER_CACHE_TTL_MS) {
      offerCache.delete(key);
      removed += 1;
    }
  }
  for (const [key, until] of modelLockCooldowns) {
    if (until <= now) {
      modelLockCooldowns.delete(key);
      removed += 1;
    }
  }
  for (const [key, until] of poolLimitCooldowns) {
    if (until <= now) {
      poolLimitCooldowns.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export class FreebuffExecutor extends BaseExecutor {
  constructor() {
    super("freebuff", PROVIDERS.freebuff);
  }

  buildUrl() {
    return this.config.baseUrl;
  }

  // The backend's model router answers 404 "No endpoints found for {model}"
  // when a tool-calling request's toolset fails its foreign_toolset gate —
  // normally prevented by injecting the CLI's `end_turn` tool (see
  // injectEndTurnTool). If one still slips through, surface a helpful message
  // instead of a bare 404, and let the standard cooldown pace retries.
  parseError(response, bodyText) {
    if (response instanceof Error || (response?.message && !response?.statusText)) {
      return {
        status: response.status || response.upstreamStatus || 502,
        message: response.message,
        resetsAtMs: response.resetsAtMs,
        poolScoped: response.poolScoped,
        freebuffKind: response.freebuffKind,
        upstreamStatus: response.upstreamStatus || response.status,
      };
    }
    const text = String(bodyText || "");
    if (response?.status === 504) {
      // 504 = gateway timeout: the relay/worker layer died (the codebuff
      // upstream itself answers 428/429/409/502/503, never 504). Declare the
      // pool scoped so chatCore marks it unfit and rotates to a healthy relay.
      return {
        status: 504,
        message: "Freebuff relay gateway timeout (504) — the proxy pool relay failed to reach codebuff.com. Retrying via another pool.",
        poolScoped: { reason: "relay_gateway_timeout" },
      };
    }
    // Proxy-egress refusal on the chat path (same as session path): rotate
    // pool, never lock the account. poolId/scope completed by chatCore.
    if (/free_mode_unavailable|anonymous_network|proxy traffic/i.test(text)) {
      return {
        status: response?.status || 403,
        message: `Freebuff free mode unavailable from this proxy egress (anonymous_network) — rotating proxy. ${text.slice(0, 160)}`,
        poolScoped: { reason: "free_mode_unavailable" },
        freebuffKind: "free_mode_unavailable",
        upstreamStatus: response?.status || 403,
      };
    }
    if (response?.status === 404 && /No endpoints found/i.test(text)) {
      return {
        status: 404,
        message: `Freebuff upstream rejected the request (404: "${text.trim().slice(0, 90)}"). Tool-calling requests need the CLI's end_turn tool — retry; if it persists the Codebuff backend may be having trouble.`,
        resetsAtMs: Date.now() + 120_000,
      };
    }
    return super.parseError(response, bodyText);
  }

  transformRequest(rawModel, body, stream, credentials) {
    const model = canonicalFreebuffModel(rawModel);
    // `freebuff_instance_id` are attached by execute() (they need the async
    // run/session registration), so this only sets the static parts.
    body.codebuff_metadata = {
      client_id:
        credentials?.providerSpecificData?.fingerprintId ||
        crypto.randomUUID(),
      cost_mode: "free",
    };
    body.provider = { allow_fallbacks: false };
    // Freebuff agents (base3-free-*) own reasoning: the backend applies the
    // agent's reasoningOptions.effort server-side, so a client-sent
    // reasoning_effort / reasoning.effort collides with that default →
    // 400 "both provided with conflicting values". Mirror the CLI: send none.
    delete body.reasoning_effort;
    delete body.reasoning;
    // Free-tier gate: first system message must open with the CLI marker.
    body = injectFreebuffMarker(body);
    // Foreign-toolset gate: tool-calling requests must declare `end_turn`.
    return injectEndTurnTool(body);
  }

  async execute({ model: rawModel, body, stream, credentials, signal, log, proxyOptions = null }) {
    const model = canonicalFreebuffModel(rawModel);
    const token = credentials?.accessToken;
    if (!token) {
      throw new Error("Freebuff requires a connected Freebuff login (no access token found)");
    }

    // Fail fast while a known-dead (account,model) / (proxy,model) pair is in
    // cooldown — no session claim, no run registration, no upstream spam.
    const proxyKey = proxyKeyOf(proxyOptions);
    const poolId = proxyOptions?.proxyPoolId || null;
    const scope = `freebuff::${model}`;
    const lockUntil = getCooldown(modelLockCooldowns, `${token}::${model}`);
    if (lockUntil) {
      const err = new Error(`Freebuff session locked to another model — retry after ${new Date(lockUntil).toLocaleTimeString()}`);
      err.status = 409;
      err.resetsAtMs = lockUntil;
      throw err;
    }
    const poolUntil = getCooldown(poolLimitCooldowns, `${proxyKey}::${model}`);
    if (poolUntil) {
      const err = new Error(`Freebuff limited-mode IP rejected ${model} — retry with a full-access proxy after ${new Date(poolUntil).toLocaleTimeString()}`);
      err.status = 409;
      err.poolScoped = { poolId, scope, reason: "limited_ip" };
      throw err;
    }
    if (proxyOptions?.noFitPool) {
      if (proxyOptions?.strictProxy) {
        const err = new Error(`Freebuff smart proxy found no available fit pool for ${scope} (all pools in cooldown)`);
        err.status = 503;
        err.poolScoped = { poolId: null, scope, reason: "no_fit_pool" };
        throw err;
      }
      log?.warn?.("PROXY", `Freebuff | all pools in cooldown for ${scope} — falling back to direct egress`);
      proxyOptions = {
        ...proxyOptions,
        connectionProxyEnabled: false,
        connectionProxyUrl: "",
        connectionNoProxy: "",
        vercelRelayUrl: "",
        proxyPoolId: null,
        noFitPool: false,
      };
    }

    let session;
    try {
      session = await ensureSession(token, model, proxyOptions);
    } catch (error) {
      if (error?.freebuffKind === "banned") {
        const accountIdent = credentials?.connectionName || credentials?.name || credentials?.email || "";
        if (accountIdent && !error.message.includes(`"${accountIdent}"`)) {
          error.message = error.message.replace(/^Freebuff account\b/i, `Freebuff account "${accountIdent}"`);
        }
      }
      const gate = sessionGateFromError(error);
      if (gate) throwSessionGateError(gate, { token, model, proxyKey, poolId, log });
      log?.error?.("AUTH", `Freebuff session failed: ${error.message}`);
      throw markRelayFailure(error, proxyOptions);
    }

    const url = this.buildUrl();
    const headers = this.buildHeaders(credentials, stream);
    // 504 from a relay is the egress dying, not a retriable upstream state —
    // bail on the first 504 so pool rotation (via parseError) happens instead
    // of burning more ~80s attempts on the same dead relay.
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...this.config.retry, 504: { attempts: 0, delayMs: 0 } };

    // Registered run whose id the backend resolves on chat. Per-request, like
    // the CLI's one-run-per-prompt granularity; closure-local so concurrent
    // requests never share a runId. trace_session_id mirrors the CLI's
    // extraCodebuffMetadata — one per run, stable across retries.
    let runId = null;
    const traceSessionId = crypto.randomUUID();

    const buildBody = () => {
      const transformed = this.transformRequest(model, body, stream, credentials);
      transformed.codebuff_metadata.run_id = runId;
      transformed.codebuff_metadata.trace_session_id = traceSessionId;
      if (session?.instanceId) {
        transformed.codebuff_metadata.freebuff_instance_id = session.instanceId;
      }
      return transformed;
    };

    // Chat POST with connect timeout + registry 429/502/503 retry + up to 2
    // retries on fetch-level network errors (per attempt the body is rebuilt
    // so each retry reuses the same registered run_id).
    const doChat = async () => {
      let networkAttempts = 0;
      const MAX_NETWORK_ATTEMPTS = 2;
      // Per-status retry counts: network blips must not consume the
      // status-retry budget (previously one shared `attempt` counter did).
      const statusRetryCounts = {};
      for (let attempt = 0; ; attempt++) {
        const transformedBody = buildBody();
        const bodyStr = JSON.stringify(transformedBody);

        const connectCtrl = new AbortController();
        const timeoutMs = this.config?.timeoutMs || FETCH_CONNECT_TIMEOUT_MS;
        const connectTimer = setTimeout(() => connectCtrl.abort(new Error("fetch connect timeout")), timeoutMs);
        const mergedSignal = signal ? AbortSignal.any([signal, connectCtrl.signal]) : connectCtrl.signal;
        let response;
        try {
          response = await proxyAwareFetch(url, { method: "POST", headers, body: bodyStr, signal: mergedSignal }, proxyOptions);
        } catch (error) {
          // A caller/stream abort (AbortError) is genuine — never retry it. A
          // transient socket/TLS reset gets a couple of quick retries so a network
          // blip doesn't fail the request and lock the model for 30s. Once
          // exhausted on a relay, blame the egress: mark the pool unfit and
          // let chatCore rotate to another pool.
          const isConnectTimeout = connectCtrl.signal.aborted && !signal?.aborted;
          if (isConnectTimeout) {
            error = new Error("fetch connect timeout");
            error.status = 502;
          }
          const aborted = error?.name === "AbortError" && !isConnectTimeout;
          if (aborted) {
            if (isConnectTimeoutAbort(error)) throw markRelayFailure(error, proxyOptions);
            throw error;
          }
          if (networkAttempts >= MAX_NETWORK_ATTEMPTS) throw markRelayFailure(error, proxyOptions);
          networkAttempts += 1;
          log?.debug?.("RETRY", `network error on ${url} (${error.message}), retry ${networkAttempts}/${MAX_NETWORK_ATTEMPTS}`);
          await abortableSleep(750, signal);
          continue;
        } finally {
          clearTimeout(connectTimer);
        }

        const entry = resolveRetryEntry(retryConfig[response.status]);
        const usedStatusRetries = statusRetryCounts[response.status] || 0;
        if (entry && usedStatusRetries < entry.attempts) {
          // Drain the doomed body first: an unread error body pins the socket
          // half-open across the backoff sleep.
          try { await response.body?.cancel(); } catch {}
          statusRetryCounts[response.status] = usedStatusRetries + 1;
          log?.debug?.("RETRY", `${response.status} on ${url}, retry ${usedStatusRetries + 1}/${entry.attempts} after ${entry.delayMs / 1000}s`);
          await abortableSleep(entry.delayMs, signal);
          continue;
        }
        return { response, transformedBody };
      }
    };

    // The run currently in flight. Only this one is FINISH-able: after a stale
    // session (428/409/410) the old run is FINISH'd "cancelled" and cleared, so
    // a later failure can never double-FINISH it (the server rejects duplicate
    // FINISHes for the same runId).
    let activeRunId = null;
    const markFinished = (status) => {
      if (!activeRunId) return;
      const id = activeRunId;
      activeRunId = null;
      finishRun(token, id, status, proxyOptions);
    };

    try {
      try {
        runId = await startRun(token, model, proxyOptions);
        activeRunId = runId;
      } catch (error) {
        log?.error?.("AUTH", `Freebuff run start failed: ${error.message}`);
        throw markRelayFailure(error, proxyOptions);
      }

      let { response, transformedBody } = await doChat();

      // Session gates that mean our claimed session is stale/absent:
      //   428 waiting_room_required — no session row / instance id missing
      //   409 session_superseded — another instance took over the session
      //   409 session_model_mismatch — session bound to a different model
      //   410 session_expired    — the active session's expires_at passed
      // model_locked / limited-tier mismatches are NOT reclaimable — the server
      // keeps refusing until the session expires or the IP tier changes, so we
      // set a cooldown and fail fast instead of force re-claiming in a loop.
      if (SESSION_STALE_CODES.has(response.status)) {
        const text = await response.text().catch(() => "");
        const gate = sessionGateFromText(text);
        if (gate.kind === "model_locked" || gate.kind === "limited_ip") {
          markFinished("cancelled");
          throwSessionGateError(gate, { token, model, proxyKey, poolId, log });
        }

        log?.debug?.("AUTH", `Freebuff ${response.status} session gate — re-claiming session`);
        markFinished("cancelled");
        try {
          session = await ensureSession(token, model, proxyOptions, true);
          runId = await startRun(token, model, proxyOptions);
          activeRunId = runId;
        } catch (error) {
          const gate2 = sessionGateFromError(error);
          if (gate2) throwSessionGateError(gate2, { token, model, proxyKey, poolId, log });
          log?.error?.("AUTH", `Freebuff session re-claim failed: ${error.message}`);
          throw markRelayFailure(error, proxyOptions);
        }
        ({ response, transformedBody } = await doChat());

        if (SESSION_STALE_CODES.has(response.status)) {
          const text2 = await response.text().catch(() => "");
          const gate3 = sessionGateFromText(text2);
          if (gate3.kind === "model_locked" || gate3.kind === "limited_ip") {
            throwSessionGateError(gate3, { token, model, proxyKey, poolId, log });
          }
          const err = new Error(
            `Freebuff session gate refused (${response.status}) — another freebuff instance may be holding the session. ${text2.slice(0, 160)}`,
          );
          err.status = response.status;
          throw err;
        }
      }

      // A successful chat means the pair is healthy again — lift any cooldowns.
      if (response.ok) {
        modelLockCooldowns.delete(`${token}::${model}`);
        poolLimitCooldowns.delete(`${proxyKey}::${model}`);
        if (poolId) clearPoolUnfit(poolId, scope);
      }

      // The authToken has no refresh path — when it dies, the user re-logs in.
      // Drop the cached session for this token so a re-login starts clean.
      if (response.status === 401) {
        sessionCache.delete(sessionCacheKey(token, model));
        const text = await response.text().catch(() => "");
        const err = new Error(`Freebuff auth failed (401) — re-login in the dashboard. ${text.slice(0, 120)}`);
        err.status = 401;
        throw err;
      }

      // Best-effort run accounting, mirroring the CLI.
      markFinished(response.ok ? "completed" : "failed");

      return { response, url, headers, transformedBody };
    } finally {
      // Never leave the current run dangling on thrown paths (network/abort/gate).
      if (activeRunId) {
        finishRun(token, activeRunId, "failed", proxyOptions);
      }
    }
  }
}

export const __test__ = {
  ensureSession,
  requestSession,
  startRun,
  canonicalFreebuffModel,
  resetSessionCache,
  rootAgentIdForModel,
  injectFreebuffMarker,
  injectEndTurnTool,
  fetchWithNetworkRetry,
  fetchSessionOffers,
  guardOfferClaim,
  markRelayFailure,
  isConnectTimeoutAbort,
  sessionGateFromText,
  sessionGateFromError,
  classifySessionGate,
  throwSessionGateError,
  OFFER_GATED_MODELS,
  FREEBUFF_SYSTEM_MARKER,
  SESSION_STALE_CODES,
  getCodebuffUserAgent,
};

export default FreebuffExecutor;

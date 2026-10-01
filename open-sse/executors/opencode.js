import crypto from "crypto";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { MEMORY_CONFIG } from "../config/runtimeConfig.js";
import { ANTHROPIC_API_VERSION } from "../providers/shared.js";
import { getThinkingLevels } from "../providers/thinkingLevels.js";
import { injectReasoningContent } from "../utils/reasoningContentInjector.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { isMuseSparkModel } from "../providers/models/helpers.js";
import {
  normalizeResponsesInput,
  clampResponsesCallId,
  coerceResponsesArguments,
  coerceResponsesOutput,
} from "../translator/formats/responsesApi.js";

import { applyFingerprintTools } from "../utils/opencodeFingerprint.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { peekStreamHead } from "../utils/streamHandler.js";
import { STREAM_COMMIT_PEEK_MS } from "../config/runtimeConfig.js";

const HEDGE_DELAY_MS = 1000;
const MAX_HEDGE_CONCURRENCY = 3;
const MAX_TOTAL_HEDGE_ATTEMPTS = 4;

const OPENCODE_UA = process.env.OPENCODE_USER_AGENT?.trim() || "opencode/1.18.31";
export { OPENCODE_UA };
// Genuine CLI UA looks like "opencode/1.18.31 ai-sdk/... runtime/bun/..." —
// forward those untouched; synthesize for everything else (bare "opencode",
// curl, SDKs) since the gate rejects them.
export const GENUINE_CLI_UA_RE = /^opencode\/\d+\.\d+/i;

export const OPENCODE_SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;
export const OPENCODE_REQUEST_RE = /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/;
const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MAX_SESSION_LENGTH = 256;
const MAX_TOOL_NAME_LEN = 128;
const SESSION_HEADER = "x-opencode-session";
const SESSION_FIELD = "_opencodeSession";
const REQ_FIELD = "_opencodeRequest";

// The free-tier gate requires the canonical lowercase quartet (bash/glob/grep/
// read). Agent clients such as Claude Code declare those tools capitalised, and
// a capitalised duplicate beside the canonical name is rejected as a duplicate —
// so declarations are canonicalised (then restored on the response side) by
// open-sse/utils/opencodeFingerprint.js rather than appended as decoys.
// (Validated live 2026-09-18: bare lowercase bash/read + empty schemas pass the
// gate; the full 12KB genuine schemas are unnecessary and waste ~3K tokens.)

function hasValidOpencodeVersion(ua) {
  const m = String(ua || "").match(/opencode\/(\d+)\.(\d+)(?:\.(\d+))?/i);
  if (!m) return false;
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10);
  return major > 1 || (major === 1 && minor >= 17);
}

const RESPONSES_MODELS = new Set([
  "muse-spark-1.2-contributor-free",
  "muse-spark-1.3-contributor-free",
]);
// Models served by the Claude transport (/zen/v1/messages) rather than
// /chat/completions. Empty: union-alpha was the only one and it was removed upstream
// (both transports answer 401 "Model union-alpha is not supported", 2026-10-01).
// Kept as a per-model set because the routing decision is per-model, so restoring a
// model here is a one-line change if OpenCode brings one back.
const MESSAGES_MODELS = new Set();

let lastTimestamp = 0;
let counter = 0;

function unstableRandom() {
  const bytes = crypto.randomBytes(14);
  let randomPart = "";
  for (let i = 0; i < 14; i++) {
    randomPart += BASE62_CHARS[bytes[i] % 62];
  }
  return randomPart;
}

export function generateSessionId(timestamp = Date.now()) {
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp;
    counter = 0;
  }
  counter++;
  const current = BigInt(timestamp) * 0x1000n + BigInt(counter);
  const value = ~current;
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn).toString(16).padStart(2, "0")).join("");
  return `ses_${time}${unstableRandom()}`;
}

export function generateRequestId(timestamp = Date.now()) {
  const current = BigInt(timestamp) * 0x1000n + 1n;
  const value = current;
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn).toString(16).padStart(2, "0")).join("");
  return `msg_${time}${unstableRandom()}`;
}

export function translateSessionId(sessionId, clientTool = "") {
  if (typeof sessionId === "string" && OPENCODE_SESSION_RE.test(sessionId.trim())) {
    return sessionId.trim();
  }
  const digest = crypto
    .createHash("sha256")
    .update(`opencode\0${clientTool || "generic"}\0${sessionId || ""}`)
    .digest();
  const timeHex = digest.subarray(0, 6).toString("hex");
  let randomPart = "";
  for (let i = 6; i < 20; i++) {
    randomPart += BASE62_CHARS[digest[i] % 62];
  }
  return `ses_${timeHex}${randomPart}`;
}

function normalizeSession(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SESSION_LENGTH) return null;
  return normalized;
}

function nativeSession(headers) {
  if (!headers || typeof headers !== "object") return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === SESSION_HEADER) {
      const normalized = normalizeSession(value);
      if (normalized && OPENCODE_SESSION_RE.test(normalized)) return normalized;
    }
  }
  return null;
}

// Upstream free-tier quota is accounted per session. Minting a fresh
// x-opencode-session on every request burns through it and surfaces as
// 429 FreeUsageLimitError with growing reset-after delays, while the real
// CLI reuses one long-lived canonical session per conversation. Mirror
// that: one stable canonical session per downstream identity, evicted
// after MEMORY_CONFIG.sessionTtlMs like the other session stores.
const stableOpencodeSessions = new Map();
const MAX_STABLE_SESSIONS = 1000;
const stableSessionCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of stableOpencodeSessions) {
    if (now - entry.lastUsed > MEMORY_CONFIG.sessionTtlMs) {
      stableOpencodeSessions.delete(key);
    }
  }
}, MEMORY_CONFIG.sessionCleanupIntervalMs);
if (stableSessionCleanup.unref) stableSessionCleanup.unref();

function identityKey(credentials) {
  const connectionId = credentials?.connectionId || credentials?.id;
  if (connectionId) {
    return `opencode:conn:${String(connectionId).slice(0, 128)}`;
  }
  const raw = credentials?.rawHeaders || {};
  const auth = raw.authorization || raw.Authorization || raw["x-api-key"] || raw["X-Api-Key"] || "";
  if (auth) {
    const digest = crypto.createHash("sha256").update(String(auth)).digest("hex").slice(0, 32);
    return `opencode:auth:${digest}`;
  }
  return "opencode:default";
}

export function stableSessionId(credentials) {
  const key = identityKey(credentials);
  const existing = stableOpencodeSessions.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    stableOpencodeSessions.delete(key);
    stableOpencodeSessions.set(key, existing);
    return existing.sessionId;
  }
  const sessionId = generateSessionId();
  if (stableOpencodeSessions.size >= MAX_STABLE_SESSIONS) {
    stableOpencodeSessions.delete(stableOpencodeSessions.keys().next().value);
  }
  stableOpencodeSessions.set(key, { sessionId, lastUsed: Date.now() });
  return sessionId;
}

function lastUserText(body) {
  try {
    if (!body || typeof body !== "object") return "";
    const arr = Array.isArray(body.messages)
      ? body.messages
      : Array.isArray(body.input)
        ? body.input
        : null;
    if (!arr) return typeof body.input === "string" ? body.input.slice(-600) : "";
    for (let i = arr.length - 1; i >= 0; i--) {
      const msg = arr[i];
      if (!msg) continue;
      if (msg.role && msg.role !== "user") continue;
      const content = msg.content;
      if (typeof content === "string" && content.trim()) return content.trim().slice(-600);
      if (Array.isArray(content)) {
        const text = content
          .map((part) => (typeof part === "string" ? part : part?.text || part?.input_text || ""))
          .join(" ")
          .trim();
        if (text) return text.slice(-600);
      }
    }
  } catch {
    return "";
  }
  return "";
}

// The real CLI sends the current user message id (stable per turn, same on
// retries) as x-opencode-request. Derive it deterministically from the
// session plus the last user message so retries share the id.
export function deriveRequestId(sessionId, body) {
  const text = lastUserText(body);
  if (!text) return generateRequestId();
  const digest = crypto.createHash("sha256").update(`opencode-req\0${sessionId || ""}\0${text}`).digest();
  const timeHex = digest.subarray(0, 6).toString("hex");
  let randomPart = "";
  for (let i = 6; i < 20; i++) {
    randomPart += BASE62_CHARS[digest[i] % 62];
  }
  const id = `msg_${timeHex}${randomPart}`;
  return OPENCODE_REQUEST_RE.test(id) ? id : generateRequestId();
}

function normalizeRequestId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SESSION_LENGTH) return null;
  return OPENCODE_REQUEST_RE.test(normalized) ? normalized : null;
}

function bodyHasSessionHints(body) {
  try {
    if (!body || typeof body !== "object") return false;
    if (typeof body.session_id === "string" && body.session_id.trim()) return true;
    if (typeof body.conversation_id === "string" && body.conversation_id.trim()) return true;
    if (typeof body.prompt_cache_key === "string" && body.prompt_cache_key.trim()) return true;
    if (body.metadata && typeof body.metadata.user_id === "string" && body.metadata.user_id.trim()) return true;
    if (body.request && body.request.sessionId != null && String(body.request.sessionId) !== "") return true;
    const arr = Array.isArray(body.messages)
      ? body.messages
      : Array.isArray(body.input)
        ? body.input
        : null;
    if (arr) {
      let assistantText = "";
      for (const msg of arr) {
        if (msg?.role === "assistant") {
          const content = msg.content;
          if (typeof content === "string") assistantText += content;
          else if (Array.isArray(content)) {
            for (const part of content) assistantText += part?.text || part?.output || "";
          }
          if (assistantText.length >= 50) return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

// Strip the thinking suffix "model(level)" so registry lookups hit the base id.
function baseModelId(model) {
  return String(model || "").replace(/\([^()]+\)\s*$/, "").trim();
}

function isResponsesModel(model) {
  const base = baseModelId(model);
  return RESPONSES_MODELS.has(base) || isMuseSparkModel(base);
}

function isMessagesModel(model) {
  return MESSAGES_MODELS.has(baseModelId(model));
}

function resolveOpencodeSession(body, credentials, providerSessionId, clientTool) {
  const headers = credentials?.rawHeaders || {};
  const native = nativeSession(headers);
  if (native) return native;

  let incoming = null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === SESSION_HEADER) {
      incoming = normalizeSession(value);
      break;
    }
  }

  const hinted = incoming || normalizeSession(providerSessionId);
  if (hinted) return translateSessionId(hinted, clientTool);

  if (credentials?.connectionId || bodyHasSessionHints(body)) {
    let viaManager = null;
    try {
      viaManager = resolveSessionId({
        headers,
        body,
        connectionId: credentials?.connectionId,
        scope: "opencode",
      });
    } catch {
      viaManager = null;
    }
    if (viaManager) return translateSessionId(viaManager, clientTool);
  }

  return stableSessionId(credentials);
}

function resolveOpencodeRequestId(body, credentials, sessionId) {
  const raw = credentials?.rawHeaders || {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.toLowerCase() === "x-opencode-request") {
      const normalized = normalizeRequestId(value);
      if (normalized) return normalized;
      break;
    }
  }
  return deriveRequestId(sessionId, body);
}

function normalizeResponsesTools(body) {
  if (!Array.isArray(body.tools)) return;
  const validNames = new Set();
  body.tools = body.tools.filter((tool) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return false;
    const fn = tool.function && typeof tool.function === "object" && !Array.isArray(tool.function) ? tool.function : null;
    const rawName = typeof tool.name === "string" ? tool.name : (typeof fn?.name === "string" ? fn.name : "");
    const name = rawName.trim();
    if (!name) return false;
    const description = typeof tool.description === "string" ? tool.description : (typeof fn?.description === "string" ? fn.description : "");
    let parameters = (tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters))
      ? tool.parameters
      : (fn?.parameters && typeof fn.parameters === "object" && !Array.isArray(fn.parameters) ? fn.parameters : { type: "object", properties: {} });
    if (parameters.type === "object" && !parameters.properties) parameters = { ...parameters, properties: {} };
    for (const k of Object.keys(tool)) delete tool[k];
    tool.type = "function";
    tool.name = name.slice(0, MAX_TOOL_NAME_LEN);
    if (description) tool.description = description;
    tool.parameters = parameters;
    validNames.add(tool.name);
    return true;
  });
  if (body.tool_choice && typeof body.tool_choice === "object" && !Array.isArray(body.tool_choice)) {
    if (body.tool_choice.type === "function") {
      const n = typeof body.tool_choice.name === "string" ? body.tool_choice.name.trim() : "";
      if (!n || !validNames.has(n)) delete body.tool_choice;
    }
  }
}

function sanitizeResponsesItems(body) {
  if (!Array.isArray(body.input)) return;
  body.input = body.input.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    // Strip prior-turn reasoning items: OpenCode Free routes to an upstream
    // Console backend where encrypted_content cannot be validated across
    // rotated accounts or sessions, causing 400 "reasoning encrypted_content
    // was not issued to this caller". Dropping prior reasoning items allows
    // multi-turn conversations and tool-calling loops to succeed cleanly.
    if (item.type === "reasoning") return false;
    delete item.encrypted_content;
    delete item.reasoning_encrypted_content;
    if (item.type === "function_call") {
      if (!item.name || typeof item.name !== "string" || item.name.trim() === "") return false;
      item.name = item.name.trim().slice(0, MAX_TOOL_NAME_LEN);
      item.call_id = clampResponsesCallId(item.call_id);
      item.arguments = coerceResponsesArguments(item.arguments);
      return true;
    }
    if (item.type === "function_call_output") {
      item.call_id = clampResponsesCallId(item.call_id);
      item.output = coerceResponsesOutput(item.output);
      return true;
    }
    return true;
  });
}

function normalizeOpencodeReasoning(model, body) {
  const current = body.reasoning;
  const currentReasoning = current && typeof current === "object" && !Array.isArray(current)
    ? current
    : null;
  const requestedEffort = typeof body.reasoning_effort === "string"
    ? body.reasoning_effort
    : currentReasoning?.effort;
  if (typeof requestedEffort !== "string") {
    // Muse Spark always spends part of the output budget on reasoning. The
    // upstream default is high, so small max_tokens requests may finish with
    // no output text. Use the lowest valid effort unless the client opts in.
    body.reasoning = { ...currentReasoning, effort: "low", summary: "auto" };
    return;
  }

  const cleanModel = baseModelId(model || body.model);
  const supportedLevels = getThinkingLevels("opencode", cleanModel);
  let effort = requestedEffort.toLowerCase().trim();
  if ((effort === "max" || effort === "ultra") && supportedLevels?.length && !supportedLevels.includes(effort)) {
    if (effort === "ultra" && supportedLevels.includes("max")) effort = "max";
    else if (supportedLevels.includes("xhigh")) effort = "xhigh";
  }

  body.reasoning = { ...currentReasoning, effort };
  if (!body.reasoning.summary) body.reasoning.summary = "auto";
  delete body.reasoning_effort;
}

const MUSE_SPARK_MAX_OUTPUT_TOKENS = 200000;

export const IP_LIMIT_BODY = /(?:egress|proxy|ip[_ -]?limit|client[_ -]?ip|source[_ -]?ip|remote[_ -]?address|network[_ -]?limit|too many requests from (?:this|your) (?:ip|network))/i;
export const FREE_TIER_GATE = /(?:free tier can only be used from within [Oo]pen[Cc]ode|free_mode_unavailable|anonymous[_ -]?network|proxy[_ -]?traffic)/i;

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super("opencode", PROVIDERS.opencode);
  }

  prepareRequestCredentials({ body, credentials, providerSessionId, clientTool } = {}) {
    const sourceCredentials = credentials || {};
    const session = resolveOpencodeSession(body, sourceCredentials, providerSessionId, clientTool);

    return {
      ...sourceCredentials,
      [SESSION_FIELD]: session,
      [REQ_FIELD]: resolveOpencodeRequestId(body, sourceCredentials, session),
    };
  }

  transformRequest(model, body, stream, credentials) {
    if (body && typeof body === "object" && model && !body.model) body.model = model;
    // Zen rejects non-streaming requests on free models with 403 FreeTierError;
    // always stream upstream and let the handler layer aggregate for non-stream clients.
    if (body && typeof body === "object") body.stream = true;
    if (isResponsesModel(model || body?.model) && body && typeof body === "object") {
      // Muse Spark models only support "auto" for tool_choice upstream.
      const isAutoOnly = isMuseSparkModel(baseModelId(model))
        || this.config.quirks?.forceAutoToolChoiceModels?.includes(baseModelId(model));
      if (isAutoOnly) {
        body.tool_choice = "auto";
      }
      const normalized = normalizeResponsesInput(body.input);
      if (normalized) body.input = normalized;
      if (!Array.isArray(body.input) || body.input.length === 0) {
        body.input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
      }
      // Responses API names the output cap max_output_tokens and takes thinking
      // as reasoning:{effort,summary} — normalize the Chat fields at this boundary.
      if (body.max_output_tokens === undefined) {
        if (body.max_completion_tokens !== undefined) body.max_output_tokens = body.max_completion_tokens;
        else if (body.max_tokens !== undefined) body.max_output_tokens = body.max_tokens;
      }
      if (!Number.isFinite(Number(body.max_output_tokens)) || Number(body.max_output_tokens) < MUSE_SPARK_MAX_OUTPUT_TOKENS) {
        body.max_output_tokens = MUSE_SPARK_MAX_OUTPUT_TOKENS;
      }
      delete body.max_tokens;
      delete body.max_completion_tokens;
      normalizeOpencodeReasoning(model, body);
      body.stream = true;
      body.store = false;
      normalizeResponsesTools(body);
      sanitizeResponsesItems(body);
      applyFingerprintTools(body, true);
      if (isAutoOnly) {
        body.tool_choice = "auto";
      }
    } else if (body && typeof body === "object") {
      applyFingerprintTools(body, false);
    }
    return injectReasoningContent({ provider: this.provider, model, body });
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null, providerSessionId, clientTool }) {
    const activeTasks = new Map();
    let winner = null;
    let lastError = null;
    let attemptIndex = 0;

    const spawnAttempt = () => {
      attemptIndex++;
      const currentIdx = attemptIndex;
      const attemptController = new AbortController();
      const mergedSignal = signal
        ? AbortSignal.any([signal, attemptController.signal])
        : attemptController.signal;

      const preparedCreds = this.prepareRequestCredentials({
        body,
        credentials,
        providerSessionId: currentIdx > 1 ? undefined : providerSessionId,
        clientTool,
      });

      const url = this.buildUrl(model);
      const transformedBody = this.transformRequest(model, body, stream, preparedCreds);
      const headers = this.buildHeaders(preparedCreds, stream, url);

      const task = {
        index: currentIdx,
        controller: attemptController,
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
            proxyOptions
          );

          if (!resp.ok) {
            const bodyText = await resp.text().catch(() => "");
            return { ok: false, status: resp.status, error: `HTTP ${resp.status}: ${bodyText.slice(0, 200)}` };
          }

          let response = resp;
          if (stream && resp.body) {
            const peeked = await peekStreamHead(resp.body, STREAM_COMMIT_PEEK_MS);
            if (peeked.failed) {
              return { ok: false, status: 502, error: peeked.error?.message || "empty stream" };
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
          };
        } catch (err) {
          if (err.name === "AbortError" && attemptController.signal.aborted) {
            return { ok: false, aborted: true };
          }
          return { ok: false, error: err.message };
        }
      })();

      task.promise = fetchPromise
        .then((res) => ({ task, res }))
        .catch((err) => ({ task, res: { ok: false, error: err.message } }));

      return task;
    };

    // Initial attempt
    const initialTask = spawnAttempt();
    activeTasks.set(initialTask.promise, initialTask);

    while (!winner && activeTasks.size > 0) {
      if (signal?.aborted) break;

      const canHedgeMore = activeTasks.size < MAX_HEDGE_CONCURRENCY && attemptIndex < MAX_TOTAL_HEDGE_ATTEMPTS;

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
          log?.info?.("HEDGE", `[OpenCode] Upstream slow (> ${HEDGE_DELAY_MS}ms), spawning companion attempt #${attemptIndex + 1}...`);
          const companionTask = spawnAttempt();
          activeTasks.set(companionTask.promise, companionTask);
        }
        continue;
      }

      // One of the active tasks settled
      const { task, res } = raced;
      activeTasks.delete(task.promise);

      if (res.ok) {
        winner = res;
        log?.info?.("HEDGE", `[OpenCode] Attempt #${task.index} won the race!`);
        break;
      } else {
        lastError = res.error || "Attempt failed";
        if (activeTasks.size === 0 && attemptIndex < MAX_TOTAL_HEDGE_ATTEMPTS) {
          const companionTask = spawnAttempt();
          activeTasks.set(companionTask.promise, companionTask);
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

    throw new Error(`[OpenCode] All speculative attempts failed: ${lastError || "No response"}`);
  }

  buildUrl(model) {
    const base = this.config.baseUrl;
    if (isResponsesModel(model)) return `${base}/zen/v1/responses`;
    if (isMessagesModel(model)) return `${base}/zen/v1/messages`;
    return `${base}/zen/v1/chat/completions`;
  }

  buildHeaders(credentials, stream = true, url = "") {
    const raw = credentials?.rawHeaders || {};
    const lower = {};
    for (const [k, v] of Object.entries(raw)) lower[k.toLowerCase()] = v;

    const downstreamUa = lower["user-agent"] || "";
    const isOpencodeDownstream = hasValidOpencodeVersion(downstreamUa);

    const session = credentials?.[SESSION_FIELD] || this.prepareRequestCredentials({ credentials })[SESSION_FIELD];
    const downstreamReq = normalizeRequestId(lower["x-opencode-request"]);
    const requestId = credentials?.[REQ_FIELD] || downstreamReq || generateRequestId();

    const headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer public",
      "User-Agent": isOpencodeDownstream ? downstreamUa : OPENCODE_UA,
      "x-opencode-client": lower["x-opencode-client"] || "desktop",
      "x-opencode-session": session,
      "x-opencode-request": requestId,
      "x-opencode-project": lower["x-opencode-project"] || "global",
      "Accept": stream ? "text/event-stream" : "*/*",
    };
    if (url.endsWith("/messages")) headers["anthropic-version"] = ANTHROPIC_API_VERSION;
    return headers;
  }

  parseError(response, bodyText) {
    const status = response?.status || 0;
    const text = String(bodyText || "");
    if ((status === 429 || status === 403) && IP_LIMIT_BODY.test(text)) {
      return {
        status,
        message: text.slice(0, 300) || `OpenCode free limit (${status})`,
        poolScoped: { reason: "ip-limit" },
      };
    }
    // Free-tier gate (e.g. "can only be used from within OpenCode"): per-egress,
    // not per-account. Mark poolScoped so chatCore retries via another pool or
    // direct egress instead of burning rotation budget on the same blocked path.
    if ((status === 429 || status === 403) && FREE_TIER_GATE.test(text)) {
      return {
        status,
        message: text.slice(0, 300) || `OpenCode free-tier gate (${status})`,
        poolScoped: { reason: "free-tier-gate" },
      };
    }
    // Bare 429 ("Rate limit exceeded. Please try again later."): this provider
    // is keyless, so quota is per-egress, not per-account. A 429 only condemns
    // the egress that served it — rotate to another pool (fresh IP/quota)
    // instead of failing fast or locking anything.
    if (status === 429) {
      return {
        status,
        message: text.slice(0, 300) || `OpenCode free quota spent on this egress (${status})`,
        poolScoped: { reason: "egress-rate-limit" },
      };
    }
    return null; // fall through to default parsing
  }
}

import { createHash } from "node:crypto";
import { BaseExecutor } from "./base";
import { PROVIDERS } from "../config/providers";
import { CODEX_DEFAULT_INSTRUCTIONS } from "../config/codexInstructions";
import { resolveCodexInstructionsForRequest } from "../config/codexInstructionsResolver";
import { normalizeResponsesInput } from "../translator/helpers/responsesApiHelper";
import { fetchImageAsBase64 } from "../translator/helpers/imageHelper";
import { getConsistentMachineId } from "../../src/shared/utils/machineId";
import { getChatRuntimeSettings } from "../utils/abort";

// In-memory map: hash(machineId + first assistant content) → { sessionId, lastUsed }
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_SESSION_MAP_SIZE = 10_000;
const assistantSessionMap = new Map();
let sessionCleanupInterval = null;

// Cache machine ID at module level (resolved once)
let cachedMachineId = null;
let machineIdPromise = null;

async function ensureMachineId() {
  if (cachedMachineId) return cachedMachineId;
  if (!machineIdPromise) {
    machineIdPromise = getConsistentMachineId()
      .then((id) => {
        cachedMachineId = id;
        return id;
      })
      .catch(() => null);
  }
  return machineIdPromise;
}

function ensureSessionCleanupInterval() {
  if (sessionCleanupInterval) return;
  sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of assistantSessionMap) {
      if (now - entry.lastUsed > SESSION_TTL_MS) assistantSessionMap.delete(key);
    }
  }, 10 * 60 * 1000);
  sessionCleanupInterval.unref?.();
}

function hashContent(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function generateSessionId() {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// Mirror of CLIProxyAPI's ensureImageGenerationTool. Adds the image_generation
// tool to body.tools (creating the array if absent) so the Codex backend
// enables multimodal input (input_image / input_file) on the request.
//
// Skipped for "spark" models and Codex free-plan accounts, matching upstream.
function isCodexFreePlanCredentials(credentials) {
  if (!credentials || typeof credentials !== "object") return false;
  const psd = credentials.providerSpecificData;
  const candidates = [
    psd?.planTypeRaw,
    psd?.planType,
    credentials.plan_type,
    credentials.planType,
    credentials.plan,
  ];
  return candidates.some((v) => typeof v === "string" && v.trim().toLowerCase() === "free");
}

function ensureImageGenerationTool(body, baseModel, credentials) {
  if (!body || typeof body !== "object") return body;
  const modelName = typeof baseModel === "string" ? baseModel : "";
  if (modelName.endsWith("spark")) return body;
  if (isCodexFreePlanCredentials(credentials)) return body;

  const tool = { type: "image_generation", output_format: "png" };
  if (!Array.isArray(body.tools)) {
    body.tools = [tool];
    return body;
  }
  for (const t of body.tools) {
    if (t && typeof t === "object" && t.type === "image_generation") return body;
  }
  body.tools.push(tool);
  return body;
}

function deleteUnsupportedCodexFields(body) {
  delete body.temperature;
  delete body.top_p;
  delete body.frequency_penalty;
  delete body.presence_penalty;
  delete body.logprobs;
  delete body.top_logprobs;
  delete body.n;
  delete body.seed;
  delete body.max_tokens;
  delete body.max_output_tokens;
  delete body.max_completion_tokens;
  delete body.user;
  delete body.prompt_cache_retention;
  delete body.metadata;
  delete body.stream_options;
  delete body.safety_identifier;
  delete body.previous_response_id;
  delete body.context_management;
  delete body.truncation;
  if (body.service_tier !== undefined && body.service_tier !== "priority") {
    delete body.service_tier;
  }
}

function sanitizeCodexCompactBody(body) {
  // Keep /compact payload minimal and avoid /responses-only flags.
  delete body.stream;
  delete body.store;
  delete body.include;
  delete body.reasoning;
  delete body.reasoning_effort;
  delete body.parallel_tool_calls;
  deleteUnsupportedCodexFields(body);

  return body;
}

// Extract text content from an input item
function extractItemText(item) {
  if (!item) return "";
  if (typeof item.content === "string") return item.content;
  if (Array.isArray(item.content)) {
    return item.content.map(c => c.text || c.output || "").filter(Boolean).join("");
  }
  return "";
}

// Resolve session_id from first assistant message + machineId to avoid cross-user collision
function resolveConversationSessionId(input, machineId) {
  const machineSessionId = machineId ? `sess_${hashContent(machineId)}` : generateSessionId();
  if (!Array.isArray(input) || input.length === 0) return machineSessionId;

  // Find first assistant message that has actual text content
  let text = "";
  for (const item of input) {
    if (item.role === "assistant") {
      text = extractItemText(item);
      if (text) break;
    }
  }
  if (!text) return machineSessionId;

  const hash = hashContent((machineId || "") + text);
  const entry = assistantSessionMap.get(hash);
  if (entry) {
    entry.lastUsed = Date.now();
    return entry.sessionId;
  }


  const sessionId = generateSessionId();
  if (assistantSessionMap.size >= MAX_SESSION_MAP_SIZE) {
    const oldestKey = assistantSessionMap.keys().next().value;
    assistantSessionMap.delete(oldestKey);
  }
  assistantSessionMap.set(hash, { sessionId, lastUsed: Date.now() });
  return sessionId;
}

/**
 * Determine rate-limit scope for a Codex model.
 * "spark" models have separate rate limits from "codex" models.
 */
const CODEX_SCOPE_PATTERNS: Array<{ pattern: string; scope: "codex" | "spark" }> = [
  { pattern: "codex-spark", scope: "spark" },
  { pattern: "spark", scope: "spark" },
  { pattern: "codex", scope: "codex" },
  { pattern: "gpt-5", scope: "codex" },
];

export function getCodexModelScope(model: string): "codex" | "spark" {
  const lower = (model || "").toLowerCase();
  for (const { pattern, scope } of CODEX_SCOPE_PATTERNS) {
    if (lower.includes(pattern)) return scope;
  }
  return "codex";
}

export function getCodexRateLimitKey(connectionId: string, model: string): string {
  return `${connectionId}:${getCodexModelScope(model)}`;
}

export interface CodexQuotaSnapshot {
  usage5h: number;
  limit5h: number;
  resetAt5h: string | null;
  usage7d: number;
  limit7d: number;
  resetAt7d: string | null;
}

/**
 * Parse Codex-specific quota headers from response.
 * Returns null if no quota headers present.
 */
export function parseCodexQuotaHeaders(headers: Headers | Record<string, string>): CodexQuotaSnapshot | null {
  const get = (name: string) => {
    if (typeof (headers as any).get === "function") return (headers as any).get(name);
    return (headers as any)[name] || null;
  };

  const usage5h = get("x-codex-5h-usage");
  const limit5h = get("x-codex-5h-limit");
  const resetAt5h = get("x-codex-5h-reset-at");
  const usage7d = get("x-codex-7d-usage");
  const limit7d = get("x-codex-7d-limit");
  const resetAt7d = get("x-codex-7d-reset-at");

  if (!usage5h && !limit5h && !resetAt5h && !usage7d && !limit7d && !resetAt7d) {
    return null;
  }

  return {
    usage5h: usage5h ? parseFloat(usage5h) : 0,
    limit5h: limit5h ? parseFloat(limit5h) : Infinity,
    resetAt5h: resetAt5h ?? null,
    usage7d: usage7d ? parseFloat(usage7d) : 0,
    limit7d: limit7d ? parseFloat(limit7d) : Infinity,
    resetAt7d: resetAt7d ?? null,
  };
}

/**
 * Compute minimum cooldown based on which quota window is exhausted.
 * @param threshold - Usage ratio that triggers cooldown (default 0.95)
 * @returns { cooldownMs, window } - 0 means no cooldown needed
 */
export function getCodexDualWindowCooldownMs(
  quota: CodexQuotaSnapshot,
  threshold = 0.95
): { cooldownMs: number; window: "7d" | "5h" | "none" } {
  const now = Date.now();

  const ratio7d = quota.limit7d > 0 && Number.isFinite(quota.limit7d)
    ? quota.usage7d / quota.limit7d : 0;
  const ratio5h = quota.limit5h > 0 && Number.isFinite(quota.limit5h)
    ? quota.usage5h / quota.limit5h : 0;

  // 7d window priority (wider window, harder limit)
  if (ratio7d >= threshold && quota.resetAt7d) {
    const resetTime = new Date(quota.resetAt7d).getTime();
    if (resetTime > now) return { cooldownMs: resetTime - now, window: "7d" };
  }

  // 5h window
  if (ratio5h >= threshold && quota.resetAt5h) {
    const resetTime = new Date(quota.resetAt5h).getTime();
    if (resetTime > now) return { cooldownMs: resetTime - now, window: "5h" };
  }

  return { cooldownMs: 0, window: "none" };
}

/**
 * Codex Executor - handles OpenAI Codex API (Responses API format)
 * Automatically injects default instructions if missing
 */
export class CodexExecutor extends BaseExecutor {
  constructor() {
    super("codex", PROVIDERS.codex);
  }

  /**
   * Override headers to add session_id per conversation.
   * Session ID is passed via credentials._codexSessionId (set in execute).
   */
  buildHeaders(credentials, stream = true) {
    const headers = super.buildHeaders(credentials, stream);
    headers["session_id"] = credentials?._codexSessionId || credentials?.connectionId || "default";
    return headers;
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    const base = super.buildUrl(model, stream, urlIndex, credentials);
    return credentials?._codexCompact ? `${base}/compact` : base;
  }

  /**
   * Inline image content for Codex backend, which cannot fetch remote URLs and
   * expects images encoded as data: URIs.
   *
   * Handles every shape that can reach this executor after request translation:
   *   - Chat Completions style: { type: "image_url", image_url: { url, detail } | "<url>" }
   *   - Responses style:        { type: "input_image", image_url: "<url>" | { url } }
   *   - File-style image:       { type: "input_file", file_data: "...", mime_type: "image/*" }
   *
   * Runs before transformRequest() and mutates body.input in place.
   */
  async prefetchImages(body) {
    if (!Array.isArray(body?.input)) return;
    for (const item of body.input) {
      if (!Array.isArray(item.content)) continue;
      const pending = item.content.map((c) => this._normalizeContentPart(c));
      item.content = await Promise.all(pending);
    }
  }

  async _normalizeContentPart(c) {
    if (!c || typeof c !== "object") return c;

    // Chat Completions native image block.
    if (c.type === "image_url") {
      const url = typeof c.image_url === "string" ? c.image_url : c.image_url?.url;
      const detail = (typeof c.image_url === "object" && c.image_url?.detail) || c.detail || "auto";
      if (!url) return c;
      if (url.startsWith("data:")) return { type: "input_image", image_url: url, detail };
      if (/^https?:/i.test(url)) {
        const fetched = await fetchImageAsBase64(url, { timeoutMs: 15000 });
        return { type: "input_image", image_url: fetched?.url || url, detail };
      }
      return { type: "input_image", image_url: url, detail };
    }

    // Responses-style image block — may carry remote URL that we still need to inline.
    if (c.type === "input_image") {
      const url = typeof c.image_url === "string" ? c.image_url : c.image_url?.url || "";
      const detail = c.detail || (typeof c.image_url === "object" && c.image_url?.detail) || "auto";
      if (url && !url.startsWith("data:") && /^https?:/i.test(url)) {
        const fetched = await fetchImageAsBase64(url, { timeoutMs: 15000 });
        return { type: "input_image", image_url: fetched?.url || url, detail };
      }
      // Normalize image_url to a plain string so downstream JSON.stringify matches Codex schema.
      if (url) return { type: "input_image", image_url: url, detail };
      return c;
    }

    // File-style image block (OpenCode @ai-sdk/openai-compatible can emit these for clipboard images).
    if (c.type === "input_file") {
      const fileData = typeof c.file_data === "string" ? c.file_data : "";
      const mime = typeof c.mime_type === "string" ? c.mime_type : "";
      const detail = c.detail || "auto";
      if (fileData.startsWith("data:image/")) {
        return { type: "input_image", image_url: fileData, detail };
      }
      if (fileData && mime.startsWith("image/")) {
        return { type: "input_image", image_url: `data:${mime};base64,${fileData}`, detail };
      }
      return c;
    }

    return c;
  }

  async execute(args) {
    ensureSessionCleanupInterval();
    cachedMachineId = await ensureMachineId();
    const isCompact = !!args?.body?._compact;
    // Fetch remote images before the synchronous transform/execute pipeline
    await this.prefetchImages(args.body);
    // Resolve user-controlled Codex default instructions setting (enabled /
    // disabled / custom .md). Stash on the body so the sync transformRequest
    // step can read it without doing async work itself.
    if (args.body && typeof args.body === "object" && !("_resolvedCodexInstructions" in args.body)) {
      try {
        args.body._resolvedCodexInstructions = await resolveCodexInstructionsForRequest();
      } catch {
        args.body._resolvedCodexInstructions = CODEX_DEFAULT_INSTRUCTIONS;
      }
    }
    // Pass compact flag via credentials so buildUrl can read it without shared state
    args.credentials = { ...args.credentials, _codexCompact: isCompact };
    return super.execute(args);
  }

  /**
   * Parse Codex usage_limit_reached to extract precise resetsAtMs.
   * Falls back to base parseError for other error types.
   */
  parseError(response, bodyText) {
    if (response.status === 429 && bodyText) {
      try {
        const json = JSON.parse(bodyText);
        const err = json?.error;
        if (err?.type === "usage_limit_reached") {
          const now = Date.now();
          let resetsAtMs: number | null = null;
          if (typeof err.resets_at === "number" && err.resets_at > 0) {
            const ms = err.resets_at * 1000;
            if (ms > now) resetsAtMs = ms;
          }
          if (!resetsAtMs && typeof err.resets_in_seconds === "number" && err.resets_in_seconds > 0) {
            resetsAtMs = now + err.resets_in_seconds * 1000;
          }
          if (resetsAtMs) {
            return { status: 429, message: err.message || bodyText, resetsAtMs };
          }
        }
      } catch { /* fall through to default */ }
    }
    return super.parseError(response, bodyText);
  }

  getTimeoutMs({ body, stream }: any = {}) {
    if (body?._compact) {
      return null;
    }

    const hasToolCalls = Array.isArray(body?.tools) && body.tools.length > 0;
    const reasoningEffort = body?.reasoning?.effort || body?.reasoning_effort || null;
    const nonStreamingAgenticRequest = stream === false && (hasToolCalls || reasoningEffort !== null);
    const runtime = getChatRuntimeSettings();

    // Fail faster for buffered/non-compact Codex turns so wedged upstream SSE
    // sessions self-abort and release the pending slot without requiring the
    // client to manually escape/disconnect.
    if (nonStreamingAgenticRequest) {
      return runtime?.codexAgenticTimeoutMs || 120_000;
    }

    return runtime?.codexNonCompactTimeoutMs || 180_000;
  }

  /**
   * Transform request before sending - inject default instructions if missing.
   * Image fetching is handled separately in prefetchImages() so this stays sync.
   */
  transformRequest(model, body, stream, credentials) {
    const isCompact = !!body._compact;
    delete body._compact;
    // Resolve conversation-stable session_id from input history + machineId
    // Pass via credentials so buildHeaders can read it without shared state
    credentials._codexSessionId = resolveConversationSessionId(body.input, cachedMachineId);
    // Convert string input to array format (Codex API requires input as array)
    const normalized = normalizeResponsesInput(body.input);
    if (normalized) body.input = normalized;

    // Ensure input is present and non-empty (Codex API rejects empty input)
    if (!body.input || (Array.isArray(body.input) && body.input.length === 0)) {
      body.input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
    }

    // Codex uses streaming on /responses and plain JSON on /responses/compact.
    if (isCompact) {
      delete body.stream;
    } else {
      body.stream = true;
    }

    // Resolve instructions per user-configurable Codex provider setting
    // (codexInstructions: { enabled, mode } in settings, optional custom .md
    // file at the AxonRouter home codex-instructions.md). Three states:
    //   1. enabled + default mode -> built-in CODEX_DEFAULT_INSTRUCTIONS
    //   2. enabled + custom mode  -> contents of the .md file
    //   3. disabled               -> empty string (matches CLIProxyAPI;
    //                                saves ~3000 tokens / request)
    // The actual lookup happens in execute() (async) and the result is stashed
    // on body._resolvedCodexInstructions; here we only consume it and clean up.
    const resolved = "_resolvedCodexInstructions" in body
      ? body._resolvedCodexInstructions
      : CODEX_DEFAULT_INSTRUCTIONS;
    delete body._resolvedCodexInstructions;
    if (body.instructions == null || body.instructions === "") {
      // Empty resolved value means "disabled" -> send empty string (CLIProxyAPI parity).
      body.instructions = typeof resolved === "string" ? resolved : CODEX_DEFAULT_INSTRUCTIONS;
    }

    if (isCompact) {
      // Strip effort suffix from model name for compact path too
      const effortLevels = ['none', 'low', 'medium', 'high', 'xhigh'];
      for (const level of effortLevels) {
        if (model.endsWith(`-${level}`) && body.model) {
          body.model = body.model.replace(`-${level}`, '');
          break;
        }
      }
      ensureImageGenerationTool(body, body.model || model, credentials);
      return sanitizeCodexCompactBody(body);
    }

    // Codex /responses uses store=false, while /compact rejects the field.
    body.store = false;

    // Match CLIProxyAPI: explicitly enable parallel tool calls so the model
    // can dispatch multiple tools concurrently rather than serially. Faster
    // wall-clock for tool-heavy turns. (codex_openai_request.go:62)
    if (body.parallel_tool_calls === undefined) {
      body.parallel_tool_calls = true;
    }

    // Extract thinking level from model name suffix
    // e.g., gpt-5.3-codex-high → high, gpt-5.3-codex → medium (default)
    const effortLevels = ['none', 'low', 'medium', 'high', 'xhigh'];
    let modelEffort = null;
    for (const level of effortLevels) {
      if (model.endsWith(`-${level}`)) {
        modelEffort = level;
        // Strip suffix from model name for actual API call
        if (body.model) body.model = body.model.replace(`-${level}`, '');
        break;
      }
    }

    // Priority: explicit reasoning.effort > reasoning_effort param > model suffix > default ("low").
    // The default is "low" to keep request latency and token usage small for the common
    // interactive case. Callers (or per-credential overrides) can still raise it explicitly.
    if (!body.reasoning) {
      const effort = body.reasoning_effort || modelEffort || 'low';
      body.reasoning = { effort, summary: "auto" };
    } else if (!body.reasoning.summary) {
      body.reasoning.summary = "auto";
    }
    delete body.reasoning_effort;

    // Include reasoning encrypted content (required by Codex backend for reasoning models)
    if (body.reasoning && body.reasoning.effort && body.reasoning.effort !== 'none') {
      body.include = ["reasoning.encrypted_content"];
    }

    // Remove unsupported parameters for Codex API
    deleteUnsupportedCodexFields(body);

    // Ensure the image_generation tool is registered on the request. The Codex
    // backend gates multimodal *input* (input_image / input_file) behind this
    // tool being present in the tools array; without it, vision is disabled
    // and the model replies "I don't support image input" even if the user
    // sent a clipboard image. CLIProxyAPI does the same in
    // internal/runtime/executor/codex_executor.go::ensureImageGenerationTool.
    ensureImageGenerationTool(body, body.model || model, credentials);

    return body;
  }
}

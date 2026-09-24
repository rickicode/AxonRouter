import crypto from "node:crypto";
import { DefaultExecutor } from "./default.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { isMuseSparkModel } from "../providers/models/helpers.js";
import { cloakOpencodeTools, OPENCODE_UA, GENUINE_CLI_UA_RE, IP_LIMIT_BODY, FREE_TIER_GATE, generateRequestId, translateSessionId, deriveRequestId } from "./opencode.js";
import { isFreeTierGateModel } from "../config/opencodeAgentTools.js";
import {
  normalizeResponsesInput,
  clampResponsesCallId,
  coerceResponsesArguments,
  coerceResponsesOutput,
} from "../translator/formats/responsesApi.js";

const SESSION_HEADER = "x-opencode-session";
const SESSION_FIELD = "_opencodeZenSession";
const MAX_SESSION_LENGTH = 256;

const RESPONSES_BASE_URL = "https://opencode.ai/zen/v1/responses";
const MAX_TOOL_NAME_LEN = 128;
const MUSE_SPARK_MAX_OUTPUT_TOKENS = 200000;

function normalizeSession(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SESSION_LENGTH) return null;
  return normalized;
}

function nativeSession(headers) {
  if (!headers || typeof headers !== "object") return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === SESSION_HEADER) return normalizeSession(value);
  }
  return null;
}

// Strip the thinking suffix "model(level)" so checks hit the base id.
function baseModelId(model) {
  return String(model || "").replace(/\([^()]+\)\s*$/, "").trim();
}


function isResponsesModel(model) {
  const base = baseModelId(model);
  return isMuseSparkModel(base) || base.startsWith("gpt-") || base.startsWith("grok-");
}

// Flatten Chat Completions tool declarations into the Responses flat shape and
// drop hosted/nameless tools the /responses endpoint rejects.
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

export class OpenCodeZenExecutor extends DefaultExecutor {
  constructor() {
    super("opencode-zen");
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    if (credentials?.runtimeTransport?.baseUrl) {
      return credentials.runtimeTransport.baseUrl;
    }
    if (isResponsesModel(model)) return RESPONSES_BASE_URL;
    return super.buildUrl(model, stream, urlIndex, credentials);
  }

  prepareRequestCredentials({ body, credentials, providerSessionId, clientTool } = {}) {
    const sourceCredentials = credentials || {};
    const native = nativeSession(sourceCredentials.rawHeaders);
    const resolved = normalizeSession(providerSessionId) || resolveSessionId({
      headers: sourceCredentials.rawHeaders,
      body,
      connectionId: sourceCredentials.connectionId,
      scope: "opencode-zen",
    });
    const session = native || translateSessionId(resolved, clientTool);
    return {
      ...sourceCredentials,
      [SESSION_FIELD]: session,
      _opencodeZenRequest: deriveRequestId(session, body),
    };
  }

  async execute(args) {
    const credentials = this.prepareRequestCredentials(args);
    return super.execute({ ...args, credentials });
  }

  buildHeaders(credentials, stream = true, url, model) {
    const raw = credentials?.rawHeaders || {};
    const lower = {};
    for (const [k, v] of Object.entries(raw)) lower[k.toLowerCase()] = v;
    const downstreamUa = lower["user-agent"] || "";
    const session = credentials?.[SESSION_FIELD]
      || this.prepareRequestCredentials({ credentials })[SESSION_FIELD];
    const requestId = credentials?._opencodeZenRequest || generateRequestId();
    if (isFreeTierGateModel(model)) {
      // Free-tier path: byte-identical OC contract. Bearer public, desktop
      // client, global project, valid ses_/msg_ pair, CLI UA.
      return {
        "Content-Type": "application/json",
        "Authorization": "Bearer public",
        "User-Agent": GENUINE_CLI_UA_RE.test(downstreamUa.trim()) ? downstreamUa : OPENCODE_UA,
        "x-opencode-client": lower["x-opencode-client"] || "desktop",
        "x-opencode-session": session,
        "x-opencode-request": requestId,
        "x-opencode-project": lower["x-opencode-project"] || "global",
        "Accept": "text/event-stream",
      };
    }
    const headers = super.buildHeaders(credentials || {}, stream, url, model);
    if (!headers["x-opencode-client"]) headers["x-opencode-client"] = "desktop";
    headers["User-Agent"] = GENUINE_CLI_UA_RE.test(downstreamUa.trim()) ? downstreamUa : OPENCODE_UA;
    if (!headers["Accept"]) headers["Accept"] = "*/*";
    headers[SESSION_HEADER] = session;
    return headers;
  }

  transformRequest(model, body, stream, credentials) {
    const out = super.transformRequest(model, body);
    const isResponses = isResponsesModel(model || body?.model) || Array.isArray(out.input);
    if (!isResponses) {
      // Chat Completions path (e.g. mimo free models): same free-tier gate as
      // the opencode executor — inject decoy bash/read tools to satisfy upstream.
      out.stream = true;
      cloakOpencodeTools(out, false);
      if (!out.tool_choice || out.tool_choice === "none") {
        out.tool_choice = "auto";
      }
      return out;
    }
    const normalized = normalizeResponsesInput(out.input);
    if (normalized) out.input = normalized;
    if (!Array.isArray(out.input) || out.input.length === 0) {
      out.input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
    }
    if (out.max_output_tokens === undefined) {
      if (out.max_completion_tokens !== undefined) out.max_output_tokens = out.max_completion_tokens;
      else if (out.max_tokens !== undefined) out.max_output_tokens = out.max_tokens;
    }
    if (isMuseSparkModel(model || body?.model)
      && (!Number.isFinite(Number(out.max_output_tokens))
        || Number(out.max_output_tokens) < MUSE_SPARK_MAX_OUTPUT_TOKENS)) {
      out.max_output_tokens = MUSE_SPARK_MAX_OUTPUT_TOKENS;
    }
    delete out.max_tokens;
    delete out.max_completion_tokens;
    if (out.reasoning_effort !== undefined && out.reasoning === undefined) {
      out.reasoning = { effort: out.reasoning_effort, summary: "auto" };
    }
    if (isMuseSparkModel(model || body?.model) && out.reasoning === undefined) {
      // Muse Spark defaults to high reasoning upstream. With ordinary client
      // budgets that consumes every output token and returns output: [] with
      // finish_reason=length. Keep the model usable unless the caller opts in.
      out.reasoning = { effort: "low", summary: "auto" };
    }
    if (out.reasoning && typeof out.reasoning === "object" && !Array.isArray(out.reasoning)) {
      if (!out.reasoning.summary) out.reasoning.summary = "auto";
    }
    delete out.reasoning_effort;
    // The Zen Responses endpoint supports both JSON and SSE. Do not force
    // non-streaming chat requests through the SSE converter: that path can
    // lose the final response.output message when the upstream returns a
    // completed JSON response. Preserve the client's requested mode.
    // Free-tier gate rejects non-streaming requests with 403 — always stream
    // upstream and let the handler layer aggregate (same as OC executor).
    out.stream = isFreeTierGateModel(model || body?.model) ? true : stream === true;
    out.store = false;
    normalizeResponsesTools(out);
    cloakOpencodeTools(out, true);
    if (!out.tool_choice) {
      out.tool_choice = "auto";
    }
    sanitizeResponsesItems(out);
    return out;
  }

  parseError(response, bodyText) {
    const status = response?.status || 0;
    const text = String(bodyText || "");
    // Free-tier gate ("can only be used from within OpenCode"): per-egress,
    // not per-account. Mark poolScoped so chatCore retries via another pool
    // instead of burning rotation budget locking accounts.
    if ((status === 429 || status === 403) && FREE_TIER_GATE.test(text)) {
      return {
        status,
        message: text.slice(0, 300) || `OpenCode free-tier gate (${status})`,
        poolScoped: { reason: "free-tier-gate" },
      };
    }
    if ((status === 429 || status === 403) && IP_LIMIT_BODY.test(text)) {
      return {
        status,
        message: text.slice(0, 300) || `OpenCode free limit (${status})`,
        poolScoped: { reason: "ip-limit" },
      };
    }
    return null;
  }
}

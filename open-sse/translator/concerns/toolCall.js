// Tool call helper functions for translator

import { FORMATS } from "../formats.js";

// Anthropic tool_use.id must match: ^[a-zA-Z0-9_-]+$
const TOOL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// Fallback streaming tool_call id when provider omits one (index optional)
export function fallbackToolCallId(index) {
  return index === undefined
    ? `call_${Date.now()}`
    : `call_${index}_${Date.now()}`;
}

// Generate deterministic tool call ID from position + tool name (cache-friendly)
export function generateToolCallId(msgIndex = 0, tcIndex = 0, toolName = "") {
  const name = toolName ? `_${toolName.replace(/[^a-zA-Z0-9_-]/g, "")}` : "";
  return `call_msg${msgIndex}_tc${tcIndex}${name}`;
}

// Sanitize ID to match Anthropic pattern: keep only alphanumeric, underscore, hyphen
function sanitizeToolId(id) {
  if (!id || typeof id !== "string") return null;
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

// Ensure all tool_calls have valid id field and arguments is string (some providers require it)
export function ensureToolCallIds(body) {
  if (!body.messages || !Array.isArray(body.messages)) return body;

  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    if (
      msg.role === "assistant" &&
      msg.tool_calls &&
      Array.isArray(msg.tool_calls)
    ) {
      for (let j = 0; j < msg.tool_calls.length; j++) {
        const tc = msg.tool_calls[j];
        // Validate or regenerate ID for Anthropic compatibility
        if (!tc.id || !TOOL_ID_PATTERN.test(tc.id)) {
          const sanitized = sanitizeToolId(tc.id);
          tc.id = sanitized || generateToolCallId(i, j, tc.function?.name);
        }
        if (!tc.type) {
          tc.type = "function";
        }
        // Ensure arguments is JSON string, not object
        if (
          tc.function?.arguments &&
          typeof tc.function.arguments !== "string"
        ) {
          tc.function.arguments = JSON.stringify(tc.function.arguments);
        }
      }
    }

    // Validate tool_call_id in tool messages (role: "tool")
    if (
      msg.role === "tool" &&
      msg.tool_call_id &&
      !TOOL_ID_PATTERN.test(msg.tool_call_id)
    ) {
      const sanitized = sanitizeToolId(msg.tool_call_id);
      msg.tool_call_id = sanitized || generateToolCallId(i, 0);
    }

    // Also validate tool_use blocks in content (Claude format)
    if (Array.isArray(msg.content)) {
      for (let k = 0; k < msg.content.length; k++) {
        const block = msg.content[k];
        if (
          block.type === "tool_use" &&
          block.id &&
          !TOOL_ID_PATTERN.test(block.id)
        ) {
          const sanitized = sanitizeToolId(block.id);
          block.id = sanitized || generateToolCallId(i, k, block.name);
        }
        // Validate tool_use_id in tool_result blocks
        if (
          block.type === "tool_result" &&
          block.tool_use_id &&
          !TOOL_ID_PATTERN.test(block.tool_use_id)
        ) {
          const sanitized = sanitizeToolId(block.tool_use_id);
          block.tool_use_id = sanitized || generateToolCallId(i, k);
        }
      }
    }
  }

  return body;
}

// Get tool_call ids from assistant message (OpenAI format: tool_calls, Claude format: tool_use in content)
export function getToolCallIds(msg) {
  if (msg.role !== "assistant") return [];

  const ids = [];

  // OpenAI format: tool_calls array
  if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      if (tc.id) ids.push(tc.id);
    }
  }

  // Claude format: tool_use blocks in content
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "tool_use" && block.id) {
        ids.push(block.id);
      }
    }
  }

  return ids;
}

// Check if user message has tool_result for given ids (OpenAI format: role=tool, Claude format: tool_result in content)
export function hasToolResults(msg, toolCallIds) {
  if (!msg || !toolCallIds.length) return false;

  // OpenAI format: role = "tool" with tool_call_id
  if (msg.role === "tool" && msg.tool_call_id) {
    return toolCallIds.includes(msg.tool_call_id);
  }

  // Claude format: tool_result blocks in user message content
  if (msg.role === "user" && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (
        block.type === "tool_result" &&
        toolCallIds.includes(block.tool_use_id)
      ) {
        return true;
      }
    }
  }

  return false;
}

// Repair strict OpenAI tool-turn ordering for Gemini-backed OpenAI-compatible
// endpoints.
//
// Call ids are unique only within a single upstream response. Gateways without
// native ids (Gemini-backed resellers emit a fresh "call_0"/"call_1" counter on
// every turn) reuse the same id across turns. Deduping with one Set shared over
// the whole conversation therefore marks a later turn's `call_0` result as
// already seen, drops it, and leaves an assistant turn whose tool_calls are
// followed straight by the next user message. Strict Gemini backends reject
// exactly that with:
//   "Please ensure that function call turn comes immediately after a user turn
//    or after a function response turn."
// Scope the matching per turn instead, and pair every call with exactly one
// result so the turn stays well-formed.
export function repairStrictOpenAIToolHistory(body, { uniqueCallIds = false } = {}) {
  if (!body?.messages || !Array.isArray(body.messages)) return body;

  const repaired = [];
  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];

    // Results are re-emitted immediately after their own assistant turn (below).
    // A `tool` message anywhere else is an orphan without a matching call and
    // would itself violate strict turn ordering.
    if (msg?.role === "tool") continue;

    if (
      msg?.role !== "assistant" ||
      !Array.isArray(msg.tool_calls) ||
      msg.tool_calls.length === 0
    ) {
      repaired.push(msg);
      continue;
    }

    const calls = msg.tool_calls.filter((call) => call?.id);
    const callEntries = calls.map((call, callIndex) => ({
      call,
      originalId: call.id,
      id: uniqueCallIds ? `unikey_call_${i}_${callIndex}` : call.id,
    }));
    const normalizedCalls = callEntries.map(({ call, id }) => ({ ...call, id }));
    repaired.push({ ...msg, tool_calls: normalizedCalls });
    if (callEntries.length === 0) continue;

    // Results belonging to this turn only — the run of `tool` messages directly
    // after it. Not a conversation-wide map: see the note above.
    const available = [];
    let j = i + 1;
    while (j < body.messages.length && body.messages[j]?.role === "tool") {
      available.push(body.messages[j]);
      j++;
    }

    const used = new Set();
    const takeResult = (entry) => {
      let idx = available.findIndex(
        (result, k) => !used.has(k) && result.tool_call_id === entry.originalId,
      );
      // Duplicate ids inside one assistant turn cannot be resolved by id alone;
      // fall back to the next unused result in order rather than dropping it.
      if (idx === -1) idx = available.findIndex((_, k) => !used.has(k));
      if (idx === -1) return null;
      used.add(idx);
      return available[idx];
    };

    for (const entry of callEntries) {
      const result = takeResult(entry);
      repaired.push(
        result
          ? { ...result, tool_call_id: entry.id }
          : {
              role: "tool",
              tool_call_id: entry.id,
              content: "[tool result unavailable]",
            },
      );
    }
    i = j - 1;
  }
  body.messages = repaired;
  return body;
}

export function fixMissingToolResponses(body) {
  if (!body.messages || !Array.isArray(body.messages)) return body;

  const newMessages = [];

  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    const nextMsg = body.messages[i + 1];

    newMessages.push(msg);

    // Check if this is assistant with tool_calls/tool_use
    const toolCallIds = getToolCallIds(msg);
    if (toolCallIds.length === 0) continue;

    // Check if next message has tool_result
    if (nextMsg && !hasToolResults(nextMsg, toolCallIds)) {
      // Insert tool responses for each tool_call
      for (const id of toolCallIds) {
        // OpenAI format: role = "tool"
        newMessages.push({
          role: "tool",
          tool_call_id: id,
          content: "",
        });
      }
    }
  }

  body.messages = newMessages;
  return body;
}

// ---------------------------------------------------------------------------
// Streaming tool-name backfill for Gemini-backed OpenAI-compatible upstreams
// (e.g. UniKey `uk/gemini-3.5-flash`).
//
// Observed upstream bug: streaming `delta.tool_calls[]` entries carry `id`
// and `arguments` but NEVER `function.name`, while the equivalent
// non-streaming response includes the name correctly. Strict clients
// (Cline/Roo/OpenCode) reject the assembled nameless call with
// "Model generated invalid tool call".
//
// Repair strategy (OpenAI merge-by-index compatible):
// - Exactly one function tool in the request → set the name immediately.
// - Multiple tools → accumulate argument fragments per index; when a finish
//   chunk arrives, JSON-parse the assembled args and pick the tool only on an
//   unambiguous match (all required present, no unknown keys). Ambiguous or
//   unparseable args are left untouched — a wrong guess could execute the
//   wrong tool, which is worse than a client-side validation error.
// ---------------------------------------------------------------------------

export function getFunctionTools(body) {
  if (!body?.tools || !Array.isArray(body.tools)) return [];
  const out = [];
  for (const t of body.tools) {
    if (t?.type === "function" && t.function?.name) {
      out.push({ name: t.function.name, parameters: t.function.parameters || {} });
    } else if (t?.name && !t.type) {
      // Claude-format tool declaration carried on an OpenAI path
      out.push({ name: t.name, parameters: t.input_schema || {} });
    }
  }
  return out;
}

function argsMatchTool(argsObj, parameters) {
  if (!argsObj || typeof argsObj !== "object" || Array.isArray(argsObj)) return false;
  const props = parameters?.properties || {};
  for (const req of parameters?.required || []) {
    if (!(req in argsObj)) return false;
  }
  for (const key of Object.keys(argsObj)) {
    if (!(key in props)) return false;
  }
  return true;
}

export function matchToolByArgs(argsStr, tools) {
  let argsObj;
  try {
    argsObj = JSON.parse(argsStr);
  } catch {
    return null;
  }
  const hits = tools.filter((t) => argsMatchTool(argsObj, t.parameters));
  return hits.length === 1 ? hits[0].name : null;
}

// Whether a nameless streaming tool start must be deferred instead of
// emitted with name:"". Only for upstreams proven to omit function.name in
// every streaming delta (UniKey-fronted Gemini models). Other providers keep
// legacy immediate-start behavior.
export function shouldDeferNamelessStart(provider, model) {
  if (provider === "unikey") return true;
  return /^((google\/)?gemini)/i.test(model || "");
}

// Resolve a nameless tool index to a tool name. Single-tool requests are
// deterministic; multi-tool requests require an unambiguous args match.
// Returns the name or null (never guesses).
export function resolveNamelessTool(tools, argsStr) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  if (tools.length === 1) return tools[0].name;
  return matchToolByArgs(argsStr, tools);
}

// Mutates an OpenAI chat-completion chunk in place. Returns true when the
// chunk was modified and must be re-serialized before forwarding.
// ctx: { tools, pending: Map(index -> { id, args }), warned }
export function repairNamelessStreamingToolCalls(parsed, ctx) {
  if (!ctx || !Array.isArray(ctx.tools) || ctx.tools.length === 0) return false;
  const choices = parsed?.choices;
  if (!Array.isArray(choices)) return false;
  let fixed = false;

  for (const choice of choices) {
    const deltas = choice?.delta?.tool_calls;
    if (Array.isArray(deltas)) {
      for (const tc of deltas) {
        if (!tc || !tc.function || tc.function.name) continue;
        const idx = tc.index ?? 0;
        if (ctx.tools.length === 1) {
          tc.function.name = ctx.tools[0].name;
          fixed = true;
        } else {
          const slot = ctx.pending.get(idx) || { id: tc.id || null, args: "" };
          if (tc.id && !slot.id) slot.id = tc.id;
          if (typeof tc.function.arguments === "string") slot.args += tc.function.arguments;
          ctx.pending.set(idx, slot);
        }
      }
    }

    // Late repair: finish chunk closes the call — resolve pending indices now.
    if (choice?.finish_reason && ctx.pending.size > 0) {
      const repairs = [];
      for (const [idx, slot] of ctx.pending) {
        const name = matchToolByArgs(slot.args, ctx.tools);
        if (name) repairs.push({ index: idx, id: slot.id, function: { name, arguments: "" } });
      }
      ctx.pending.clear();
      if (repairs.length > 0) {
        if (!choice.delta || typeof choice.delta !== "object") choice.delta = {};
        choice.delta.tool_calls = (choice.delta.tool_calls || []).concat(repairs);
        fixed = true;
      } else if (!ctx.warned) {
        ctx.warned = true;
        console.warn(`[toolCall] nameless streaming tool_calls left unrepaired (ambiguous args, tools=${ctx.tools.length})`);
      }
    }
  }
  return fixed;
}

// Default `type: "custom"` on Claude-format tools that arrive without one.
// Anthropic's Claude tool schema requires `type` to be explicitly set; strict gateways
// (e.g., MiniMax Anthropic-compatible endpoint, error 2013) reject legacy payloads that
// omit it with HTTP 400. Tools that already carry a truthy `type` (e.g., `computer_use`,
// `bash`, `web_search_20250305`) are passed through untouched.
//
// Spread order matters: `{ ...tool, type: "custom" }` (spread first, override last)
// ensures that falsy `type` values (null, undefined, "") in the original tool don't
// overwrite the default. `{ type: "custom", ...tool }` would let `type: null` survive.
export function defaultClaudeToolType(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => (tool?.type ? tool : { ...tool, type: "custom" }));
}

// Whether Claude-format tools need explicit `type` defaulting before dispatch.
// Only gateways that declare the `requireClaudeToolType` quirk (MiniMax) reject typeless
// tools. Applying the default globally breaks Claude-format endpoints that only accept the
// legacy typeless tool shape — DeepSeek's Anthropic-compatible endpoint answers HTTP 400
// "unknown variant `custom`" and every Claude Code request routed there fails (#3905).
export function shouldDefaultClaudeToolType(
  provider,
  finalFormat,
  tools,
  PROVIDERS,
) {
  return (
    finalFormat === FORMATS.CLAUDE &&
    Array.isArray(tools) &&
    PROVIDERS?.[provider]?.quirks?.requireClaudeToolType === true
  );
}

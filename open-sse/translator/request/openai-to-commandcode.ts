/**
 * OpenAI -> CommandCode request translator
 *
 * Upstream `/alpha/generate` schema:
 *  - params.system: STRING at top level (system messages NOT allowed in messages[])
 *  - params.messages[*].role in {"user","assistant","tool"}
 *  - params.messages[*].content: Array of content blocks (NEVER a string)
 *  - tool_use blocks (assistant): {type:"tool-call", toolCallId, toolName, input}
 *  - tool_result blocks (role=tool): {type:"tool-result", toolCallId, toolName, output}
 *  - tools[*]: {name, description, input_schema}
 */
import { register } from "../index";
import { FORMATS } from "../formats";
import { randomUUID } from "crypto";
import { resolveCommandCodeInstructionsForRequest } from "../../config/commandcodeInstructionsResolver";

function flattenText(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const p of content) {
      if (typeof p === "string") parts.push(p);
      else if (p && typeof p === "object" && typeof p.text === "string") parts.push(p.text);
    }
    return parts.join("\n");
  }
  return String(content);
}

function toContentBlocks(content) {
  if (content == null) return [{ type: "text", text: "" }];
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (Array.isArray(content)) {
    const blocks: any[] = [];
    for (const part of content) {
      if (typeof part === "string") {
        blocks.push({ type: "text", text: part });
      } else if (part && typeof part === "object") {
        if (part.type === "text" && typeof part.text === "string") {
          blocks.push({ type: "text", text: part.text });
        } else if (part.type === "image_url" || part.type === "image") {
          blocks.push({ type: "text", text: "[image omitted]" });
        } else if (part.type === "tool_result") {
          blocks.push({
            type: "tool-result",
            toolCallId: part.tool_use_id || part.toolCallId || part.id || "",
            toolName: part.toolName || part.name || "tool",
            output: normalizeToolResultOutput(part.content),
            ...(part.is_error ? { isError: true } : {}),
          });
        } else if (typeof part.text === "string") {
          blocks.push({ type: "text", text: part.text });
        }
      }
    }
    return blocks.length ? blocks : [{ type: "text", text: "" }];
  }
  return [{ type: "text", text: String(content) }];
}

function safeParseJson(s) {
  if (s == null) return {};
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return {}; }
}

function normalizeToolResultOutput(content) {
  if (typeof content === "string") {
    return { type: "text", value: content };
  }

  if (!Array.isArray(content)) {
    if (content && typeof content === "object") {
      try {
        return { type: "json", value: JSON.stringify(content) };
      } catch {
        return { type: "text", value: "" };
      }
    }
    return { type: "text", value: "" };
  }

  const textParts: string[] = [];
  const imageParts: any[] = [];

  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") {
      textParts.push(part.text);
      continue;
    }
    if (part.type === "image" && part.source) {
      imageParts.push({ type: "image", source: part.source });
      continue;
    }
    if (part.type === "image_url" && part.image_url?.url) {
      imageParts.push({ type: "image", image: part.image_url.url });
    }
  }

  if (imageParts.length > 0) {
    return {
      type: "json",
      value: JSON.stringify({ text: textParts.join("\n\n"), images: imageParts }),
    };
  }

  return { type: "text", value: textParts.join("\n\n") };
}

function findAssistantToolCall(messages, toolCallId) {
  if (!Array.isArray(messages) || !toolCallId) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const msg = messages[index];
    if (msg?.role !== "assistant") continue;

    if (Array.isArray(msg.tool_calls)) {
      const match = msg.tool_calls.find((toolCall) => toolCall?.id === toolCallId);
      if (match) {
        return {
          toolCallId,
          toolName: match?.function?.name || match?.name || "tool",
        };
      }
    }

    if (Array.isArray(msg.content)) {
      const match = msg.content.find((part) => part?.type === "tool_use" && (part.id || part.toolCallId) === toolCallId);
      if (match) {
        return {
          toolCallId,
          toolName: match?.name || match?.toolName || "tool",
        };
      }
    }
  }

  return null;
}

function convertMessages(messages: any[] = [], allMessages: any[] = []) {
  const out: any[] = [];
  const systemTexts: string[] = [];

  for (const m of messages) {
    if (!m) continue;
    const role = m.role;

    if (role === "system" || role === "developer") {
      const t = flattenText(m.content);
      if (t) systemTexts.push(t);
      continue;
    }

    if (role === "tool") {
      const toolCallId = m.tool_call_id || m.toolCallId || m.id || "";
      const toolRef = findAssistantToolCall(allMessages, toolCallId);
      out.push({
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId,
          toolName: m.tool_name || m.toolName || m.name || toolRef?.toolName || "tool",
          output: normalizeToolResultOutput(m.content),
          ...(m.is_error ? { isError: true } : {}),
        }],
      });
      continue;
    }

    if (role === "assistant") {
      const blocks: any[] = [];
      const text = flattenText(m.content);
      if (text) blocks.push({ type: "text", text });
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          const fn = tc.function || {};
          blocks.push({
            type: "tool-call",
            toolCallId: tc.id || "",
            toolName: fn.name || "",
            input: safeParseJson(fn.arguments),
          });
        }
      }
      out.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "" }] });
      continue;
    }

    // user role
    out.push({ role: "user", content: toContentBlocks(m.content) });
  }

  // Filter duplicate empty tool results: if multiple tool messages share the same toolCallId,
  // keep only the one with non-empty output (handles fixMissingToolResponses inserting blanks)
  const filtered = out.filter((message, index) => {
    if (message?.role !== "tool") return true;
    const item = message.content?.[0];
    if (item?.type !== "tool-result") return true;
    const value = item.output?.value || "";
    if (value) return true;

    return !out.some((other, otherIndex) => {
      if (otherIndex === index || other?.role !== "tool") return false;
      const otherItem = other.content?.[0];
      return otherItem?.type === "tool-result"
        && otherItem.toolCallId === item.toolCallId
        && (otherItem.output?.value || "") !== "";
    });
  });

  return { messages: filtered, system: systemTexts.join("\n\n") };
}

function convertTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const result: any[] = [];
  for (const t of tools) {
    if (!t) continue;
    if (t.type === "function" && t.function) {
      result.push({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters || { type: "object" },
      });
    } else if (t.name && (t.input_schema || t.parameters)) {
      result.push({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema || t.parameters,
      });
    }
  }
  return result.length ? result : undefined;
}

function normalizeToolChoice(toolChoice) {
  if (!toolChoice || toolChoice === "auto") return { type: "auto" };
  if (toolChoice === "none") return { type: "none" };
  if (toolChoice === "required") return { type: "any" };
  if (typeof toolChoice === "string") return { type: "tool", name: toolChoice };
  if (toolChoice?.type === "function") {
    return {
      type: "tool",
      name: toolChoice.function?.name || toolChoice.name || "",
    };
  }
  return toolChoice;
}

function hasExplicitInstructionMessages(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((msg) => {
    if (!msg || (msg.role !== "system" && msg.role !== "developer")) return false;
    return Boolean(flattenText(msg.content));
  });
}

function collectInstructionText(messages, injectedInstructionText = "") {
  const blocks: string[] = [];

  if (typeof injectedInstructionText === "string" && injectedInstructionText.trim()) {
    blocks.push(injectedInstructionText.trim());
  }

  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (!msg || (msg.role !== "system" && msg.role !== "developer")) continue;
      const text = flattenText(msg.content);
      if (text) blocks.push(text);
    }
  }

  return blocks.join("\n\n").trim();
}

async function openaiToCommandCode(model, body, stream) {
  const sourceMessages = Array.isArray(body.messages) ? body.messages : [];
  const shouldInjectDefaultInstructions = !hasExplicitInstructionMessages(sourceMessages);
  const defaultInstructions = shouldInjectDefaultInstructions
    ? await resolveCommandCodeInstructionsForRequest()
    : "";

  const systemPrompt = collectInstructionText(sourceMessages, defaultInstructions);
  const { messages } = convertMessages(sourceMessages, sourceMessages);
  const tools = convertTools(body.tools);

  const params: any = {
    model,
    messages,
    stream: stream !== false,
    max_tokens: body.max_tokens ?? body.max_output_tokens ?? 64000,
    temperature: body.temperature ?? 0.3,
  };

  if (systemPrompt) params.system = systemPrompt;
  if (tools) params.tools = tools;
  if (body.top_p != null) params.top_p = body.top_p;
  if (body.tool_choice !== undefined) params.toolChoice = normalizeToolChoice(body.tool_choice);

  const today = new Date().toISOString().slice(0, 10);

  return {
    model,
    threadId: randomUUID(),
    memory: "",
    config: {
      workingDir: process.cwd(),
      date: today,
      environment: process.platform,
      structure: [],
      isGitRepo: false,
      currentBranch: "",
      mainBranch: "",
      gitStatus: "",
      recentCommits: [],
    },
    params,
  };
}

register(FORMATS.OPENAI, FORMATS.COMMANDCODE, openaiToCommandCode, null);

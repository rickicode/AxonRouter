// Capability degradation concern for AxonRouter open-sse pipeline.
// Normalizes or degrades unsupported request capabilities in-place
// (generation controls, thinking/reasoning, tools, media modalities, max tokens)
// instead of rejecting or failing upstream.

import { FORMATS } from "../formats.js";
import { stripUnsupportedModalities } from "./modality.js";

/**
 * Trailing run of items after the last assistant/model turn = current user turn.
 */
function trailingUserItems(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const isAssistant = (r) => r === "assistant" || r === "model";
  let i = arr.length - 1;
  while (i >= 0 && !isAssistant(arr[i]?.role)) i--;
  return arr.slice(i + 1);
}

/**
 * Derives the set of capabilities required by a request across wire formats.
 * @param {object} body - Incoming request payload
 * @param {object} [options] - Options ({ fullHistoryModalities: boolean })
 * @returns {Set<string>} Set of capability strings (vision, pdf, audioInput, videoInput, tools, parallelToolCalls, reasoning, search)
 */
export function deriveRequiredCapabilities(body, options = {}) {
  const required = new Set();
  if (!body || typeof body !== "object") return required;

  // 1. Modalities
  const addByMime = (mime) => {
    if (typeof mime !== "string") return;
    if (mime.startsWith("image/")) required.add("vision");
    else if (mime === "application/pdf") required.add("pdf");
    else if (mime.startsWith("audio/")) required.add("audioInput");
    else if (mime.startsWith("video/")) required.add("videoInput");
  };

  const scanBlock = (b) => {
    if (!b || typeof b !== "object") return;
    const t = b.type;
    if (t === "image_url" || t === "image" || t === "input_image") required.add("vision");
    if (t === "input_audio" || t === "audio_url" || t === "audio") required.add("audioInput");
    if (t === "input_video" || t === "video_url" || t === "video") required.add("videoInput");
    if (t === "file" || t === "document" || t === "input_file") {
      let fmime = null;
      if (b.input_audio?.format) fmime = `audio/${b.input_audio.format}`;
      else if (b.file?.file_data) fmime = String(b.file.file_data).match(/^data:([^;,]+)/)?.[1];
      else if (b.source?.media_type) fmime = b.source.media_type;
      else if (b.source?.data) fmime = String(b.source.data).match(/^data:([^;,]+)/)?.[1];
      if (fmime) addByMime(fmime);
      else required.add("pdf");
    }
    if (b.inlineData?.mimeType || b.fileData?.mimeType) {
      addByMime(b.inlineData?.mimeType || b.fileData?.mimeType);
    }
    if (t === "tool_use" || t === "tool_result") {
      required.add("tools");
    }
    if (t === "thinking") {
      required.add("reasoning");
    }
  };

  const scanContent = (content) => {
    if (Array.isArray(content)) {
      for (const b of content) scanBlock(b);
    } else if (typeof content === "string") {
      if (content.includes("data:image/")) required.add("vision");
      else if (content.includes("data:audio/")) required.add("audioInput");
      else if (content.includes("data:application/pdf")) required.add("pdf");
    }
  };

  const scanMessage = (m) => {
    if (!m || typeof m !== "object") return;
    if (Array.isArray(m.images) && m.images.length > 0) required.add("vision");
    const atts = m.experimental_attachments || m.attachments;
    if (Array.isArray(atts)) {
      for (const att of atts) {
        if (!att) continue;
        const mime = att.contentType || att.mediaType || (typeof att.url === "string" && att.url.match(/^data:([^;,]+)/)?.[1]);
        if (mime) addByMime(mime);
        else if (att.url || att.data) required.add("vision");
      }
    }
    if (m.image_url || m.image) required.add("vision");
    if (m.audio_url || m.audio) required.add("audioInput");
    if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) required.add("tools");
    if (m.role === "tool" || m.role === "function") required.add("tools");
    if (m.reasoning_content) required.add("reasoning");
    scanContent(m.content);
  };

  // Modalities: by default scanned on trailing user items (current user turn)
  // unless fullHistoryModalities is explicitly enabled.
  const userMessages = options.fullHistoryModalities ? (body.messages || []) : trailingUserItems(body.messages);
  for (const m of userMessages) scanMessage(m);

  const userInputs = options.fullHistoryModalities ? (body.input || []) : trailingUserItems(body.input);
  for (const it of userInputs) scanContent(it?.content);

  const rawContents = body.contents || body.request?.contents;
  const userContents = options.fullHistoryModalities ? (rawContents || []) : trailingUserItems(rawContents);
  for (const c of userContents) {
    if (Array.isArray(c?.parts)) {
      for (const p of c.parts) scanBlock(p);
    }
  }

  // Full history scan for structural features: tools and reasoning
  if (Array.isArray(body.messages)) {
    for (const m of body.messages) {
      if (Array.isArray(m?.tool_calls) && m.tool_calls.length > 0) required.add("tools");
      if (m?.role === "tool" || m?.role === "function") required.add("tools");
      if (m?.reasoning_content) required.add("reasoning");
      if (Array.isArray(m?.content)) {
        for (const b of m.content) {
          if (b?.type === "tool_use" || b?.type === "tool_result") required.add("tools");
          if (b?.type === "thinking") required.add("reasoning");
        }
      }
    }
  }
  if (Array.isArray(body.input)) {
    for (const it of body.input) {
      if (it?.type === "function_call" || it?.type === "function_call_output") {
        required.add("tools");
      }
    }
  }
  if (Array.isArray(rawContents)) {
    for (const c of rawContents) {
      if (Array.isArray(c?.parts)) {
        for (const p of c.parts) {
          if (p?.functionCall || p?.functionResponse) required.add("tools");
        }
      }
    }
  }

  // Tools & controls
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    required.add("tools");
    for (const tool of body.tools) {
      if (tool?.type === "web_search" || tool?.type === "web_search_preview" || tool?.type === "search" || tool?.function?.name === "web_search") {
        required.add("search");
      }
    }
  }
  if (body.tool_choice) required.add("tools");
  if (body.parallel_tool_calls === true) required.add("parallelToolCalls");

  // Reasoning / thinking
  if (body.reasoning_effort || body.thinking || body.reasoning) {
    required.add("reasoning");
  }

  // Web search
  if (body.web_search) required.add("search");

  return required;
}

/**
 * Flattens tool calls and results in OpenAI messages into transcript text blocks.
 */
function degradeOpenAITools(messages) {
  if (!Array.isArray(messages)) return;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") continue;

    // Convert assistant tool calls to transcript text
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const toolLines = msg.tool_calls.map((tc) => {
        const name = tc?.function?.name || tc?.name || "tool";
        let args = tc?.function?.arguments || tc?.arguments;
        if (typeof args !== "string") {
          try { args = JSON.stringify(args || {}); } catch { args = ""; }
        }
        return `[Tool Call: ${name} with args: ${args}]`;
      });
      const baseContent = typeof msg.content === "string" ? msg.content : (Array.isArray(msg.content) ? msg.content.map((b) => b?.text || "").join(" ") : "");
      msg.content = baseContent ? `${baseContent}\n${toolLines.join("\n")}` : toolLines.join("\n");
      delete msg.tool_calls;
    }

    // Convert tool / function result turns to user message transcript
    if (msg.role === "tool" || msg.role === "function") {
      const toolName = msg.name || msg.tool_call_id || "tool";
      let resText = "";
      if (typeof msg.content === "string") {
        resText = msg.content;
      } else if (Array.isArray(msg.content)) {
        resText = msg.content.map((b) => b?.text || JSON.stringify(b)).join(" ");
      } else {
        try { resText = JSON.stringify(msg.content ?? ""); } catch { resText = String(msg.content); }
      }
      msg.role = "user";
      msg.content = `[Tool Result (${toolName}): ${resText}]`;
      delete msg.tool_call_id;
      delete msg.name;
    }
  }
}

/**
 * Flattens Claude tool_use and tool_result content blocks into text.
 */
function degradeClaudeTools(messages) {
  if (!Array.isArray(messages)) return;
  for (const msg of messages) {
    if (!msg || !Array.isArray(msg.content)) continue;
    msg.content = msg.content.map((block) => {
      if (!block || typeof block !== "object") return block;
      if (block.type === "tool_use") {
        const name = block.name || "tool";
        let args = "";
        try { args = JSON.stringify(block.input || {}); } catch { args = ""; }
        return { type: "text", text: `[Tool Call: ${name} with args: ${args}]` };
      }
      if (block.type === "tool_result") {
        let res = "";
        if (typeof block.content === "string") res = block.content;
        else if (Array.isArray(block.content)) res = block.content.map((b) => b?.text || JSON.stringify(b)).join(" ");
        else try { res = JSON.stringify(block.content ?? ""); } catch { res = ""; }
        return { type: "text", text: `[Tool Result: ${res}]` };
      }
      return block;
    });
  }
}

/**
 * Flattens Gemini functionCall and functionResponse parts into text.
 */
function degradeGeminiTools(contents) {
  if (!Array.isArray(contents)) return;
  for (const c of contents) {
    if (!c || !Array.isArray(c.parts)) continue;
    c.parts = c.parts.map((p) => {
      if (p?.functionCall) {
        let args = "";
        try { args = JSON.stringify(p.functionCall.args || {}); } catch { args = ""; }
        return { text: `[Tool Call: ${p.functionCall.name || "tool"} with args: ${args}]` };
      }
      if (p?.functionResponse) {
        let res = "";
        try { res = JSON.stringify(p.functionResponse.response || {}); } catch { res = ""; }
        return { text: `[Tool Result: ${res}]` };
      }
      return p;
    });
  }
}

/**
 * Flattens Responses function_call and function_call_output items into text.
 */
function degradeResponsesTools(items) {
  if (!Array.isArray(items)) return;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== "object") continue;
    if (it.type === "function_call") {
      items[i] = {
        type: "message",
        role: "assistant",
        content: `[Tool Call: ${it.name} with args: ${it.arguments || ""}]`
      };
    } else if (it.type === "function_call_output") {
      items[i] = {
        type: "message",
        role: "user",
        content: `[Tool Result: ${it.output || ""}]`
      };
    }
  }
}

/**
 * Degrades an incoming request in-place to conform to target model capabilities.
 *
 * @param {object} body - Request payload (source wire format)
 * @param {string} sourceFormat - Request wire format from FORMATS
 * @param {object} caps - Capabilities returned by getCapabilitiesForModel
 * @param {object} [options] - Optional logging and context metadata
 * @returns {{ degraded: boolean, degradedCapabilities: string[] }}
 */
export function degradeRequestForCapabilities(body, sourceFormat, caps, { provider, model, log } = {}) {
  if (!body || typeof body !== "object" || !caps) {
    return { degraded: false, degradedCapabilities: [] };
  }

  const degradedCaps = [];

  // 1. Modalities (vision / audio / pdf)
  if (stripUnsupportedModalities(body, sourceFormat, caps)) {
    if (caps.vision === false) degradedCaps.push("vision");
    if (caps.audioInput === false) degradedCaps.push("audioInput");
    if (caps.pdf === false) degradedCaps.push("pdf");
  }

  // 2. Tools
  if (caps.tools === false) {
    let hadTools = false;
    if (body.tools !== undefined) {
      delete body.tools;
      hadTools = true;
    }
    if (body.tool_choice !== undefined) {
      delete body.tool_choice;
      hadTools = true;
    }
    if (body.parallel_tool_calls !== undefined) {
      delete body.parallel_tool_calls;
      hadTools = true;
    }

    // Message transcripts degradation
    switch (sourceFormat) {
      case FORMATS.CLAUDE:
        degradeClaudeTools(body.messages);
        break;
      case FORMATS.GEMINI:
      case FORMATS.GEMINI_CLI:
      case FORMATS.VERTEX:
        degradeGeminiTools(body.contents);
        break;
      case FORMATS.ANTIGRAVITY:
        degradeGeminiTools(body?.request?.contents);
        break;
      case FORMATS.OPENAI_RESPONSES:
      case FORMATS.OPENAI_RESPONSE:
      case FORMATS.CODEX:
        degradeResponsesTools(body.input);
        break;
      case FORMATS.OPENAI:
      case FORMATS.OLLAMA:
      case FORMATS.KIRO:
      case FORMATS.CURSOR:
      case FORMATS.COMMANDCODE:
      default:
        degradeOpenAITools(body.messages);
        break;
    }

    if (hadTools) degradedCaps.push("tools");
  }

  // 3. Parallel Tool Calls
  if (caps.parallelToolCalls === false && body.parallel_tool_calls !== undefined) {
    delete body.parallel_tool_calls;
    degradedCaps.push("parallelToolCalls");
  }

  // 4. Reasoning / Thinking
  if (caps.reasoning === false) {
    let hadReasoning = false;
    if (body.reasoning_effort !== undefined) {
      delete body.reasoning_effort;
      hadReasoning = true;
    }
    if (body.thinking !== undefined) {
      delete body.thinking;
      hadReasoning = true;
    }
    if (body.reasoning !== undefined) {
      delete body.reasoning;
      hadReasoning = true;
    }

    // Strip assistant reasoning_content or thinking blocks
    if (Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        if (!msg) continue;
        if (msg.reasoning_content !== undefined) {
          delete msg.reasoning_content;
          hadReasoning = true;
        }
        if (Array.isArray(msg.content)) {
          const prevLen = msg.content.length;
          msg.content = msg.content.filter((b) => b?.type !== "thinking");
          if (msg.content.length < prevLen) hadReasoning = true;
        }
      }
    }

    if (hadReasoning) degradedCaps.push("reasoning");
  }

  // 5. Built-in Web Search
  if (caps.search === false) {
    if (body.web_search !== undefined) {
      delete body.web_search;
      degradedCaps.push("search");
    }
    if (Array.isArray(body.tools)) {
      const origLen = body.tools.length;
      body.tools = body.tools.filter((t) => {
        const type = t?.type;
        const name = t?.function?.name;
        return type !== "web_search" && type !== "web_search_preview" && type !== "search" && name !== "web_search";
      });
      if (body.tools.length < origLen) degradedCaps.push("search");
    }
  }

  // 6. Max output clamping
  if (typeof caps.maxOutput === "number" && caps.maxOutput > 0) {
    const clampField = (field) => {
      if (typeof body[field] === "number" && body[field] > caps.maxOutput) {
        body[field] = caps.maxOutput;
        degradedCaps.push(`clamp:${field}`);
      }
    };
    clampField("max_tokens");
    clampField("max_completion_tokens");
    clampField("max_output_tokens");
  }

  return {
    degraded: degradedCaps.length > 0,
    degradedCapabilities: [...new Set(degradedCaps)],
  };
}

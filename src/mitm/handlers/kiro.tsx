const fs = require("fs");
const path = require("path");
const err = (msg) => console.error(`[${new Date().toLocaleTimeString("en-US", { hour12: false })}] ❌ [MITM] ${msg}`);
const { fetchRouter } = require("./base");
const { DATA_DIR } = require("../paths");

const KIRO_CAPTURE_DIR = path.join(DATA_DIR, "mitm", "kiro-captures");
const TEXT_ENCODER = new TextEncoder();

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function ensureCaptureDir() {
  fs.mkdirSync(KIRO_CAPTURE_DIR, { recursive: true });
}

function writeCaptureFile(prefix, payload) {
  ensureCaptureDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(KIRO_CAPTURE_DIR, `${timestamp}_${prefix}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function encodeHeader(name, value) {
  const nameBytes = TEXT_ENCODER.encode(name);
  const valueBytes = TEXT_ENCODER.encode(value);
  const header = new Uint8Array(1 + nameBytes.length + 1 + 2 + valueBytes.length);
  let offset = 0;
  header[offset++] = nameBytes.length;
  header.set(nameBytes, offset);
  offset += nameBytes.length;
  header[offset++] = 7;
  header[offset++] = (valueBytes.length >> 8) & 0xff;
  header[offset++] = valueBytes.length & 0xff;
  header.set(valueBytes, offset);
  return header;
}

function concatArrays(...arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function buildEventFrame(eventType, payload) {
  const headers = concatArrays(
    encodeHeader(":event-type", eventType),
    encodeHeader(":content-type", "application/json"),
    encodeHeader(":message-type", "event")
  );
  const payloadBytes = payload == null
    ? new Uint8Array()
    : TEXT_ENCODER.encode(typeof payload === "string" ? payload : JSON.stringify(payload));
  const totalLength = 12 + headers.length + payloadBytes.length + 4;
  const frame = new Uint8Array(totalLength);
  const view = new DataView(frame.buffer);
  view.setUint32(0, totalLength, false);
  view.setUint32(4, headers.length, false);
  view.setUint32(8, crc32(frame.slice(0, 8)), false);
  frame.set(headers, 12);
  frame.set(payloadBytes, 12 + headers.length);
  view.setUint32(totalLength - 4, crc32(frame.slice(0, totalLength - 4)), false);
  return frame;
}

function parseSSEEvents(text) {
  const events = [];
  const parts = String(text || "").split("\n\n");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === "data: [DONE]") continue;
    const lines = trimmed.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        events.push(JSON.parse(raw));
      } catch {
        // ignore malformed chunks
      }
    }
  }
  return events;
}

function toolResultText(result) {
  if (!Array.isArray(result?.content)) return "";
  return result.content.map((part) => part?.text || "").filter(Boolean).join("\n");
}

function stripKiroBoilerplate(text) {
  const value = String(text || "");
  const envIdx = value.indexOf("<EnvironmentContext>");
  const trimmed = envIdx >= 0 ? value.slice(0, envIdx).trim() : value.trim();
  return trimmed;
}

function buildOpenAIMessagesFromConversationState(body) {
  const state = body?.conversationState || {};
  const history = Array.isArray(state.history) ? state.history : [];
  const current = state.currentMessage?.userInputMessage || {};
  const messages = [];

  for (const entry of history) {
    const user = entry?.userInputMessage;
    if (user) {
      const toolResults = Array.isArray(user?.userInputMessageContext?.toolResults)
        ? user.userInputMessageContext.toolResults
        : [];
      const content = typeof user.content === "string" ? stripKiroBoilerplate(user.content) : "";

      if (toolResults.length > 0) {
        for (const result of toolResults) {
          messages.push({
            role: "tool",
            tool_call_id: result?.toolUseId,
            content: toolResultText(result),
          });
        }
      } else if (content) {
        messages.push({ role: "user", content });
      }
      continue;
    }

    const assistant = entry?.assistantResponseMessage;
    if (assistant) {
      const text = typeof assistant.content === "string" ? assistant.content : "";
      const toolUses = Array.isArray(assistant.toolUses) ? assistant.toolUses : [];
      if (toolUses.length > 0) {
        messages.push({
          role: "assistant",
          content: text,
          tool_calls: toolUses.map((toolUse) => ({
            id: toolUse.toolUseId,
            type: "function",
            function: {
              name: toolUse.name || "tool",
              arguments: JSON.stringify(toolUse.input || {}),
            },
          })),
        });
      } else if (text) {
        messages.push({ role: "assistant", content: text });
      }
    }
  }

  const currentContent = typeof current.content === "string" ? stripKiroBoilerplate(current.content) : "";
  const toolResults = Array.isArray(current?.userInputMessageContext?.toolResults)
    ? current.userInputMessageContext.toolResults
    : [];

  if (toolResults.length > 0) {
    for (const result of toolResults) {
      messages.push({
        role: "tool",
        tool_call_id: result?.toolUseId,
        content: toolResultText(result),
      });
    }
  } else if (currentContent) {
    messages.push({ role: "user", content: currentContent });
  }

  return messages.filter((msg) => msg.role === "tool" || String(msg.content || "").length > 0 || Array.isArray(msg.tool_calls));
}

function buildOpenAIToolsFromConversationState(body) {
  const tools = body?.conversationState?.currentMessage?.userInputMessage?.userInputMessageContext?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool?.toolSpecification?.name || "tool",
      description: tool?.toolSpecification?.description || "",
      parameters: tool?.toolSpecification?.inputSchema?.json || { type: "object", properties: {} },
    },
  }));
}

function normalizeToolInput(name, input) {
  const normalized = input && typeof input === "object" && !Array.isArray(input) ? { ...input } : {};
  const toolName = String(name || "").toLowerCase();

  const fillPath = () => {
    if (typeof normalized.path !== "string" || !normalized.path.trim()) {
      normalized.path = ".";
    }
  };

  const fillExplanation = () => {
    if (typeof normalized.explanation !== "string" || !normalized.explanation.trim()) {
      normalized.explanation = "Inspect the current workspace to answer the user's request.";
    }
  };

  const fillTargetFile = () => {
    if (typeof normalized.targetFile !== "string" || !normalized.targetFile.trim()) {
      normalized.targetFile = normalized.path && typeof normalized.path === "string" && normalized.path.trim()
        ? normalized.path
        : "README.md";
    }
  };

  const fillQuery = () => {
    if (typeof normalized.query !== "string" || !normalized.query.trim()) {
      normalized.query = "*";
    }
  };

  if (toolName.includes("list_directory")) {
    fillPath();
    fillExplanation();
  }

  if (toolName.includes("file_search")) {
    fillQuery();
    fillExplanation();
  }

  if (toolName.includes("read") || toolName.includes("grep")) {
    fillPath();
    fillExplanation();
  }

  if (toolName.includes("delete_file") || toolName.includes("remove_file") || toolName === "delete") {
    fillTargetFile();
    fillExplanation();
  }

  if (toolName.includes("move_file") || toolName.includes("rename_file")) {
    fillTargetFile();
    if (typeof normalized.destination !== "string" || !normalized.destination.trim()) {
      normalized.destination = `${normalized.targetFile}.bak`;
    }
    fillExplanation();
  }

  if (toolName.includes("write") || toolName.includes("create_file") || toolName.includes("fs_write")) {
    fillTargetFile();
    if (typeof normalized.content !== "string") {
      normalized.content = "";
    }
    fillExplanation();
  }

  if (toolName.includes("execute_bash")) {
    if (typeof normalized.command !== "string" || !normalized.command.trim()) {
      normalized.command = "pwd";
    }
    fillExplanation();
  }

  return normalized;
}

function openAIToKiroEventFrames(chunks) {
  const frames = [];
  const toolStates = new Map();
  let assistantText = "";
  let promptTokens = 0;
  let completionTokens = 0;

  for (const chunk of chunks) {
    const choices = Array.isArray(chunk?.choices) ? chunk.choices : [];
    const delta = choices[0]?.delta || {};

    if (typeof delta.content === "string" && delta.content) {
      assistantText += delta.content;
      frames.push(buildEventFrame("assistantResponseEvent", { content: delta.content }));
    }

    const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const call of toolCalls) {
      const id = call.id || call.function?.id || call.index || `tool_${toolStates.size}`;
      if (!toolStates.has(id)) {
        toolStates.set(id, { name: call.function?.name || "", args: "" });
      }
      const state = toolStates.get(id);
      if (call.function?.name && !state.name) state.name = call.function.name;
      if (typeof call.function?.arguments === "string") state.args += call.function.arguments;
    }

    if (chunk?.usage) {
      promptTokens = chunk.usage.prompt_tokens || promptTokens;
      completionTokens = chunk.usage.completion_tokens || completionTokens;
    }
  }

  for (const [toolUseId, state] of toolStates.entries()) {
    let parsedInput = {};
    try {
      parsedInput = state.args ? JSON.parse(state.args) : {};
    } catch {
      parsedInput = {};
    }

    parsedInput = normalizeToolInput(state.name, parsedInput);
    const serializedInput = JSON.stringify(parsedInput);

    frames.push(buildEventFrame("toolUseEvent", { name: state.name, toolUseId }));
    frames.push(buildEventFrame("toolUseEvent", { input: "", name: state.name, toolUseId }));
    const step = 24;
    for (let i = 0; i < serializedInput.length; i += step) {
      frames.push(buildEventFrame("toolUseEvent", {
        input: serializedInput.slice(i, i + step),
        name: state.name,
        toolUseId,
      }));
    }
    frames.push(buildEventFrame("toolUseEvent", { name: state.name, stop: true, toolUseId }));
  }

  if (assistantText && toolStates.size === 0) {
    frames.push(buildEventFrame("messageStopEvent", {}));
  }

  frames.push(buildEventFrame("contextUsageEvent", { contextUsagePercentage: 1 }));
  frames.push(buildEventFrame("metricsEvent", {
    inputTokens: promptTokens,
    outputTokens: completionTokens,
  }));
  frames.push(buildEventFrame("meteringEvent", { unit: "credit", unitPlural: "credits", usage: 0 }));

  return frames;
}

async function pipeKiroEventStream(routerRes, res) {
  const text = await routerRes.text();
  const events = parseSSEEvents(text);
  const frames = openAIToKiroEventFrames(events);

  res.writeHead(200, {
    "Content-Type": "application/vnd.amazon.eventstream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  for (const frame of frames) {
    res.write(Buffer.from(frame));
  }
  res.end();
}

/**
 * Intercept Kiro request — replace model and forward to router
 */
async function intercept(req, res, bodyBuffer, mappedModel) {
  try {
    const rawText = bodyBuffer.toString();
    const body = JSON.parse(rawText);

    const rawCapture = {
      timestamp: new Date().toISOString(),
      host: req.headers.host || null,
      url: req.url,
      method: req.method,
      mappedModel: mappedModel || null,
      headers: {
        "content-type": req.headers["content-type"] || null,
        authorization: req.headers.authorization ? "[redacted]" : null,
        "x-api-key": req.headers["x-api-key"] ? "[redacted]" : null,
        "user-agent": req.headers["user-agent"] || null,
      },
      rawBody: body,
    };
    const rawFile = writeCaptureFile("raw-request", rawCapture);

    const openaiBody = {
      model: mappedModel,
      messages: buildOpenAIMessagesFromConversationState(body),
      tools: buildOpenAIToolsFromConversationState(body),
      stream: true,
    };

    const forwardedCapture = {
      timestamp: new Date().toISOString(),
      sourceCapture: path.basename(rawFile),
      forwardedPath: "/v1/chat/completions",
      forwardedBody: openaiBody,
    };
    writeCaptureFile("forwarded-request", forwardedCapture);

    const routerRes = await fetchRouter(openaiBody, "/v1/chat/completions", req.headers);
    await pipeKiroEventStream(routerRes, res);
  } catch (error) {
    err(`[Kiro] ${error.message}`);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: error.message, type: "mitm_error" } }));
  }
}

module.exports = { intercept };

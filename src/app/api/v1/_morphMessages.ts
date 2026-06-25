import { dispatchMorphCapability } from "@/app/api/morph/_dispatch";
import { withOtelSpan } from "@/lib/observability/otel";
import { getConfiguredMorphSettings } from "@/app/api/morph/_shared";
import { createMorphDispatchError } from "@/lib/morph/keySelection";
import { isMorphFastModel } from "@/shared/constants/models";
import {
  cloneResponseHeadersWithoutLength,
  normalizeMorphReasoningMessage,
} from "@/lib/morph/reasoning";
import { injectMorphInstructionsIntoOpenAIChatPayload } from "@/lib/morph/instructions";
import { resolveMorphInstructionsForRequest } from "../../../../open-sse/config/morphInstructionsResolver";

import { maybeCompactCleanApplyPayload } from "@/lib/morph/compact";
import { maybeBuildMorphFastApplyPayload } from "@/lib/morph/fastApplyIntercept";
import {
  sanitizeOpenAIFunctionName,
  sanitizeOpenAIToolChoice,
} from "@/lib/toolNameSanitizer";

async function readJsonBody(req) {
  try {
    return await req.json();
  } catch {
    throw createMorphDispatchError("Invalid JSON body", {
      status: 400,
      code: "MORPH_INVALID_JSON",
      dispatchStarted: false,
    });
  }
}

function getRequestModel(payload) {
  return typeof payload?.model === "string" ? payload.model.trim() : "";
}

function isMorphManagedMessagesModel(model) {
  return isMorphFastModel(model.replace(/^morph\//, ""));
}

function normalizeClaudeTextParts(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (part.type === "text" || part.type === "input_text")
        return part.text || "";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeClaudeToolResultContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const text = content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (part.type === "text" || part.type === "input_text")
        return part.text || "";
      return "";
    })
    .filter(Boolean)
    .join("\n");

  return text;
}

function normalizeClaudeMessages(messages) {
  const normalized = [];

  for (const msg of Array.isArray(messages) ? messages : []) {
    if (!msg || typeof msg !== "object") continue;

    const role = msg.role === "assistant" ? "assistant" : "user";
    const contentParts = Array.isArray(msg.content)
      ? msg.content
      : [{ type: "text", text: normalizeClaudeTextParts(msg.content) }];
    const textParts = [];
    const assistantToolCalls = [];

    for (const part of contentParts) {
      if (!part || typeof part !== "object") continue;

      if (part.type === "text" || part.type === "input_text") {
        if (part.text) textParts.push(part.text);
        continue;
      }

      if (part.type === "tool_use") {
        assistantToolCalls.push({
          id: part.id || `call_${Date.now()}`,
          type: "function",
          function: {
            name: sanitizeOpenAIFunctionName(part.name || ""),
            arguments: JSON.stringify(part.input || {}),
          },
        });
        continue;
      }

      if (part.type === "tool_result") {
        normalized.push({
          role: "tool",
          tool_call_id: part.tool_use_id || part.toolCallId || part.id || "",
          content: normalizeClaudeToolResultContent(part.content),
        });
      }
    }

    if (role === "assistant") {
      if (textParts.length > 0 || assistantToolCalls.length > 0) {
        normalized.push({
          role: "assistant",
          ...(textParts.length > 0
            ? { content: textParts.join("\n") }
            : { content: "" }),
          ...(assistantToolCalls.length > 0
            ? { tool_calls: assistantToolCalls }
            : {}),
        });
      }
      continue;
    }

    const textContent = textParts.join("\n");
    if (textContent) {
      normalized.push({ role: "user", content: textContent });
    }
  }

  return normalized;
}

function normalizeClaudeTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;

  const normalized = tools
    .map((tool) => {
      if (tool?.name && tool?.input_schema) {
        return {
          type: "function",
          function: {
            name: sanitizeOpenAIFunctionName(tool.name),
            description: tool.description || "",
            parameters: tool.input_schema || { type: "object", properties: {} },
          },
        };
      }

      if (tool?.type === "function" && tool.function) {
        return tool;
      }

      return null;
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

async function translateClaudeRequestToOpenAI(body) {
  const normalizedModel = getRequestModel(body).replace(/^morph\//, "");
  const messages = [];
  let resolvedInstructions = "";

  if (body.system) {
    const systemContent = Array.isArray(body.system)
      ? body.system
          .map((entry) => entry?.text || "")
          .filter(Boolean)
          .join("\n")
      : String(body.system || "");
    if (systemContent) {
      messages.push({ role: "system", content: systemContent });
    }
  } else {
    resolvedInstructions = await resolveMorphInstructionsForRequest();
  }

  messages.push(...normalizeClaudeMessages(body.messages));

  const requestedMaxTokens = Number(body?.max_tokens);
  const boostedMaxTokens =
    Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0
      ? Math.max(requestedMaxTokens, 96)
      : 96;

  const payload = {
    model: normalizedModel,
    messages,
    stream: body?.stream === true,
    max_tokens: boostedMaxTokens,
    temperature: body?.temperature,
    top_p: body?.top_p,
    ...(() => {
      const nt = normalizeClaudeTools(body.tools);
      return nt ? { tools: nt } : {};
    })(),
    ...(body.tool_choice
      ? { tool_choice: sanitizeOpenAIToolChoice(body.tool_choice) }
      : {}),
    ...(typeof body.parallel_tool_calls === "boolean"
      ? { parallel_tool_calls: body.parallel_tool_calls }
      : {}),
  };

  return injectMorphInstructionsIntoOpenAIChatPayload(
    payload,
    resolvedInstructions,
  );
}

function mapFinishReasonToClaude(reason) {
  if (reason === "tool_calls") return "tool_use";
  if (reason === "length") return "max_tokens";
  return "end_turn";
}

function createClaudeStreamingBridge(response, model) {
  const source = response.body;
  if (!source) {
    return Response.json(
      { error: "Morph upstream stream missing body" },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let messageId = null;
  let emittedMessageStart = false;
  let textStarted = false;
  let textBlockIndex = -1;
  let blockIndex = 0;
  let toolIndexById = new Map();

  function toSse(event, data) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  function mapToolCall(toolCall) {
    let parsedArguments = {};
    try {
      parsedArguments = JSON.parse(toolCall.function?.arguments || "{}");
    } catch {
      parsedArguments = {};
    }

    return {
      type: "tool_use",
      id: toolCall.id || `call_${Date.now()}`,
      name: sanitizeOpenAIFunctionName(toolCall.function?.name || ""),
      input: parsedArguments,
    };
  }

  function convertChunk(parsed) {
    const chunks = [];
    const choice = parsed?.choices?.[0] || {};
    const delta = choice?.delta || {};
    messageId ||= String(parsed?.id || `msg_${Date.now()}`).replace(
      /^chatcmpl-/,
      "",
    );

    if (!emittedMessageStart) {
      emittedMessageStart = true;
      chunks.push(
        toSse("message_start", {
          type: "message_start",
          message: {
            id: messageId,
            type: "message",
            role: "assistant",
            model: parsed?.model || model,
            content: [],
          },
        }),
      );
    }

    if (
      typeof delta.reasoning_content === "string" &&
      delta.reasoning_content.length > 0
    ) {
      const thinkIdx = blockIndex++;
      chunks.push(
        toSse("content_block_start", {
          type: "content_block_start",
          index: thinkIdx,
          content_block: { type: "thinking", thinking: "" },
        }),
      );
      chunks.push(
        toSse("content_block_delta", {
          type: "content_block_delta",
          index: thinkIdx,
          delta: { type: "thinking_delta", thinking: delta.reasoning_content },
        }),
      );
      chunks.push(
        toSse("content_block_stop", {
          type: "content_block_stop",
          index: thinkIdx,
        }),
      );
    }

    if (typeof delta.content === "string" && delta.content.length > 0) {
      if (!textStarted) {
        textStarted = true;
        textBlockIndex = blockIndex++;
        chunks.push(
          toSse("content_block_start", {
            type: "content_block_start",
            index: textBlockIndex,
            content_block: { type: "text", text: "" },
          }),
        );
      }

      chunks.push(
        toSse("content_block_delta", {
          type: "content_block_delta",
          index: textBlockIndex,
          delta: { type: "text_delta", text: delta.content },
        }),
      );
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const toolCall of delta.tool_calls) {
        const toolId = toolCall.id || `call_${Date.now()}`;
        if (!toolIndexById.has(toolId)) {
          toolIndexById.set(toolId, blockIndex++);
          chunks.push(
            toSse("content_block_start", {
              type: "content_block_start",
              index: toolIndexById.get(toolId),
              content_block: mapToolCall(toolCall),
            }),
          );
          chunks.push(
            toSse("content_block_stop", {
              type: "content_block_stop",
              index: toolIndexById.get(toolId),
            }),
          );
        }
      }
    }

    if (choice.finish_reason) {
      if (textStarted) {
        chunks.push(
          toSse("content_block_stop", {
            type: "content_block_stop",
            index: textBlockIndex,
          }),
        );
      }
      chunks.push(
        toSse("message_delta", {
          type: "message_delta",
          delta: {
            stop_reason: mapFinishReasonToClaude(choice.finish_reason),
            stop_sequence: null,
          },
          usage: parsed?.usage
            ? {
                input_tokens: parsed.usage.prompt_tokens || 0,
                output_tokens: parsed.usage.completion_tokens || 0,
              }
            : undefined,
        }),
      );
      chunks.push(toSse("message_stop", { type: "message_stop" }));
    }

    return chunks.join("");
  }

  const transformed = source.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const normalized = buffer.replace(/\r\n/g, "\n");
        const parts = normalized.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const dataLines = part
            .split("\n")
            .filter((line) => line.startsWith("data:"));
          if (dataLines.length === 0) continue;
          const data = dataLines.map((line) => line.slice(5).trim()).join("\n");
          if (!data || data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const converted = convertChunk(parsed);
            if (converted) controller.enqueue(encoder.encode(converted));
          } catch {
            // Ignore malformed SSE chunks and keep streaming.
          }
        }
      },
      flush(controller) {
        const finalText = buffer + decoder.decode();
        if (!finalText.trim()) return;
        const dataLines = finalText
          .split("\n")
          .filter((line) => line.startsWith("data:"));
        const data = dataLines.map((line) => line.slice(5).trim()).join("\n");
        if (!data || data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          const converted = convertChunk(parsed);
          if (converted) controller.enqueue(encoder.encode(converted));
        } catch {
          // Ignore malformed tail chunk.
        }
      },
    }),
  );

  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(
        cloneResponseHeadersWithoutLength(response.headers).entries(),
      ),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function translateOpenAIResponseToClaude(response, model, stream) {
  if (stream) {
    return createClaudeStreamingBridge(response, model);
  }

  const responseText = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return new Response(responseText, {
      status: response.status,
      statusText: response.statusText,
      headers: cloneResponseHeadersWithoutLength(response.headers),
    });
  }

  const choice = parsed.choices?.[0] || {};
  const message = normalizeMorphReasoningMessage(choice.message || {});
  const content = [];
  const cleanedText =
    typeof message.content === "string" ? message.content : "";

  if (cleanedText.length > 0) {
    content.push({ type: "text", text: cleanedText });
  }

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      let parsedArguments = {};
      try {
        parsedArguments = JSON.parse(toolCall.function?.arguments || "{}");
      } catch {
        parsedArguments = {};
      }
      content.push({
        type: "tool_use",
        id: toolCall.id || `call_${Date.now()}`,
        name: sanitizeOpenAIFunctionName(toolCall.function?.name || ""),
        input: parsedArguments,
      });
    }
  }

  const finalContent =
    content.length > 0
      ? content
      : typeof message.reasoning_content === "string" &&
          message.reasoning_content.trim().length > 0
        ? [
            {
              type: "text",
              text: "[Morph returned reasoning only before completion]",
            },
          ]
        : [];

  const finalPayload = {
    id: String(parsed.id || `msg_${Date.now()}`).replace(/^chatcmpl-/, ""),
    type: "message",
    role: "assistant",
    model: parsed.model || model,
    content: finalContent,
    stop_reason: mapFinishReasonToClaude(choice.finish_reason),
    stop_sequence: null,
    usage: parsed.usage
      ? {
          input_tokens: parsed.usage.prompt_tokens || 0,
          output_tokens: parsed.usage.completion_tokens || 0,
        }
      : undefined,
  };

  return new Response(JSON.stringify(finalPayload), {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function maybeDispatchMorphMessagesRequest(req) {
  const requestPayload = await readJsonBody(req.clone());
  const model = getRequestModel(requestPayload);

  if (!isMorphManagedMessagesModel(model)) {
    return null;
  }

  return withOtelSpan("morph.messages.route", {
    "axonrouter.morph.endpoint": "messages",
    "axonrouter.morph.requested_model": model,
  }, async () => {
    const morphSettings = await getConfiguredMorphSettings();
    if (!morphSettings) {
      return Response.json({ error: "Morph is not configured" }, { status: 503 });
    }

    const translatedRequest = await withOtelSpan("morph.messages.translate", {
      "axonrouter.morph.endpoint": "messages",
      "axonrouter.morph.requested_model": model,
    }, () => translateClaudeRequestToOpenAI(requestPayload));
    const fastApplyIntercept = await withOtelSpan("morph.messages.fast_apply_intercept", {
      "axonrouter.morph.endpoint": "messages",
    }, () => maybeBuildMorphFastApplyPayload(
      translatedRequest,
      morphSettings,
    ));
    const compactedRequest = fastApplyIntercept.intercept
      ? fastApplyIntercept.requestPayload
      : await withOtelSpan("morph.messages.compact_payload", {
        "axonrouter.morph.endpoint": "messages",
      }, () => maybeCompactCleanApplyPayload(translatedRequest, morphSettings));
    const upstreamResponse = await dispatchMorphCapability({
      capability: "apply",
      req,
      morphSettings,
      requestPayload: compactedRequest,
      requestBody: JSON.stringify(compactedRequest),
      requestLabel: fastApplyIntercept.intercept
        ? "morph:v1-messages:fast-apply"
        : "morph:v1-messages",
    });

    return withOtelSpan("morph.messages.translate_response", {
      "axonrouter.morph.endpoint": "messages",
      "axonrouter.morph.fast_apply_intercept": fastApplyIntercept.intercept === true,
    }, () => translateOpenAIResponseToClaude(
      upstreamResponse,
      model.replace(/^morph\//, ""),
      requestPayload?.stream === true,
    ));
  });
}

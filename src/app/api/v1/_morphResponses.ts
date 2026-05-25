import { dispatchMorphCapability } from "@/app/api/morph/_dispatch";
import { withOtelSpan } from "@/lib/observability/otel";
import { getConfiguredMorphSettings } from "@/app/api/morph/_shared";
import { createMorphDispatchError } from "@/lib/morph/keySelection";
import { isMorphFastModel } from "@/shared/constants/models";
import {
  cloneResponseHeadersWithoutLength,
  createMorphReasoningEventTransformer,
  normalizeMorphReasoningMessage,
} from "@/lib/morph/reasoning";
import { injectMorphInstructionsIntoOpenAIChatPayload } from "@/lib/morph/instructions";
import { resolveMorphInstructionsForRequest } from "../../../../open-sse/config/morphInstructionsResolver";
import {
  applyMorphAutoResolution,
  createMorphContextLengthPreflightResponse,
  resolveMorphAutoModel,
  shouldPreflightRejectMorphContext,
} from "@/lib/morph/autoRouting";
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

function isMorphManagedResponsesModel(model) {
  return isMorphFastModel(model.replace(/^morph\//, ""));
}

function normalizeResponsesContentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (
        part.type === "input_text" ||
        part.type === "output_text" ||
        part.type === "text"
      )
        return part.text || "";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeResponsesInputToMessages(input) {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  if (!Array.isArray(input)) {
    return [];
  }

  const messages = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;

    if (item.type === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: item.call_id || item.tool_call_id || item.id || "",
        content:
          typeof item.output === "string"
            ? item.output
            : JSON.stringify(item.output || {}),
      });
      continue;
    }

    if (item.type === "message" || item.role) {
      const role =
        item.role === "assistant"
          ? "assistant"
          : item.role === "system" || item.role === "developer"
            ? "system"
            : "user";

      const assistantToolCalls = [];
      const content =
        typeof item.content === "string"
          ? item.content
          : Array.isArray(item.content)
            ? item.content
                .map((part) => {
                  if (!part || typeof part !== "object") return "";
                  if (part.type === "function_call") {
                    assistantToolCalls.push({
                      id: part.call_id || part.id || `call_${Date.now()}`,
                      type: "function",
                      function: {
                        name: sanitizeOpenAIFunctionName(part.name || ""),
                        arguments: part.arguments || "{}",
                      },
                    });
                    return "";
                  }
                  if (
                    part.type === "input_text" ||
                    part.type === "output_text" ||
                    part.type === "text"
                  )
                    return part.text || "";
                  return "";
                })
                .filter(Boolean)
                .join("\n")
            : "";

      if (role === "assistant") {
        messages.push({
          role,
          content,
          ...(assistantToolCalls.length > 0
            ? { tool_calls: assistantToolCalls }
            : {}),
        });
      } else {
        messages.push({ role, content });
      }
    }
  }

  return messages;
}

function normalizeResponsesTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;

  const normalized = tools
    .map((tool) => {
      if (tool?.type === "function" && tool.name) {
        return {
          type: "function",
          function: {
            name: sanitizeOpenAIFunctionName(tool.name),
            description: tool.description || "",
            parameters: tool.parameters ||
              tool.input_schema || { type: "object", properties: {} },
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

async function translateResponsesRequestToOpenAI(body) {
  const normalizedModel = getRequestModel(body).replace(/^morph\//, "");
  const messages = [];
  let resolvedInstructions = "";

  if (typeof body.instructions === "string" && body.instructions.trim()) {
    messages.push({ role: "system", content: body.instructions.trim() });
  } else {
    resolvedInstructions = await resolveMorphInstructionsForRequest();
  }

  messages.push(...normalizeResponsesInputToMessages(body.input));

  const payload = {
    model: normalizedModel,
    messages,
    stream: body?.stream === true,
    max_tokens: body?.max_output_tokens || body?.max_tokens,
    temperature: body?.temperature,
    top_p: body?.top_p,
    ...(normalizeResponsesTools(body.tools)
      ? { tools: normalizeResponsesTools(body.tools) }
      : {}),
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

function createResponsesStreamingBridge(response, model) {
  const source = response.body?.pipeThrough(
    createMorphReasoningEventTransformer(),
  );
  if (!source) {
    return Response.json(
      { error: "Morph upstream stream missing body" },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let responseId = null;
  let outputIndex = 0;
  const streamedToolCalls = new Map();

  function toSse(data) {
    return `data: ${JSON.stringify(data)}\n\n`;
  }

  function convertChunk(parsed) {
    const chunks = [];
    const choice = parsed?.choices?.[0] || {};
    const delta = choice?.delta || {};
    responseId ||= `resp_${parsed?.id || Date.now()}`;

    if (
      typeof delta.reasoning_content === "string" &&
      delta.reasoning_content.length > 0
    ) {
      chunks.push(
        toSse({
          type: "response.reasoning.delta",
          response_id: responseId,
          output_index: outputIndex,
          delta: delta.reasoning_content,
        }),
      );
    }

    if (typeof delta.content === "string" && delta.content.length > 0) {
      chunks.push(
        toSse({
          type: "response.output_text.delta",
          response_id: responseId,
          output_index: outputIndex,
          delta: delta.content,
        }),
      );
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const toolCall of delta.tool_calls) {
        const key = Number.isInteger(toolCall.index)
          ? toolCall.index
          : streamedToolCalls.size;
        const existing = streamedToolCalls.get(key) || {
          id: toolCall.id || null,
          name: "",
          arguments: "",
        };
        streamedToolCalls.set(key, {
          id: toolCall.id || existing.id,
          name: toolCall.function?.name || existing.name,
          arguments: `${existing.arguments}${toolCall.function?.arguments || ""}`,
        });
      }
    }

    if (choice.finish_reason) {
      for (const toolCall of streamedToolCalls.values()) {
        chunks.push(
          toSse({
            type: "response.function_call_arguments.done",
            response_id: responseId,
            output_index: ++outputIndex,
            item_id: `fc_${toolCall.id || Date.now()}`,
            call_id: toolCall.id || null,
            name: sanitizeOpenAIFunctionName(toolCall.name || ""),
            arguments: toolCall.arguments || "{}",
          }),
        );
      }
      streamedToolCalls.clear();
      chunks.push(
        toSse({
          type: "response.completed",
          response: {
            id: responseId,
            object: "response",
            created_at: parsed?.created || Math.floor(Date.now() / 1000),
            status: "completed",
            error: null,
            model: parsed?.model || model,
            usage: parsed?.usage
              ? {
                  input_tokens: parsed.usage.prompt_tokens || 0,
                  output_tokens: parsed.usage.completion_tokens || 0,
                  total_tokens:
                    parsed.usage.total_tokens ||
                    (parsed.usage.prompt_tokens || 0) +
                      (parsed.usage.completion_tokens || 0),
                }
              : undefined,
          },
        }),
      );
      chunks.push("data: [DONE]\n\n");
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

async function translateOpenAIResponseToResponses(response, model, stream) {
  if (stream) {
    return createResponsesStreamingBridge(response, model);
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
  const output = [];
  const content = [];
  const normalizedReasoning =
    typeof message.reasoning_content === "string" &&
    message.reasoning_content.trim().length > 0
      ? message.reasoning_content.trim()
      : null;
  const cleanedText =
    typeof message.content === "string" ? message.content : "";

  if (cleanedText.length > 0) {
    content.push({
      type: "output_text",
      text: cleanedText,
      annotations: [],
      logprobs: [],
    });
  }

  if (normalizedReasoning) {
    output.push({
      id: `rs_${parsed.id || Date.now()}`,
      type: "reasoning",
      summary: [
        {
          type: "summary_text",
          text: normalizedReasoning,
        },
      ],
    });
  }

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      output.push({
        id: `fc_${toolCall.id || Date.now()}`,
        type: "function_call",
        call_id: toolCall.id || null,
        name: sanitizeOpenAIFunctionName(toolCall.function?.name || ""),
        arguments: toolCall.function?.arguments || "{}",
      });
    }
  }

  if (
    content.length > 0 ||
    output.length === 0 ||
    (output.length > 0 && output[0]?.type !== "message")
  ) {
    output.unshift({
      id: `msg_${parsed.id || Date.now()}`,
      type: "message",
      role: "assistant",
      content,
    });
  }

  const finalPayload = {
    id: `resp_${parsed.id || Date.now()}`,
    object: "response",
    created_at: parsed.created || Math.floor(Date.now() / 1000),
    status: "completed",
    error: null,
    model: parsed.model || model,
    output,
    usage: parsed.usage
      ? {
          input_tokens: parsed.usage.prompt_tokens || 0,
          output_tokens: parsed.usage.completion_tokens || 0,
          total_tokens:
            parsed.usage.total_tokens ||
            (parsed.usage.prompt_tokens || 0) +
              (parsed.usage.completion_tokens || 0),
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

export async function maybeDispatchMorphResponsesRequest(req) {
  const requestPayload = await readJsonBody(req.clone());
  const model = getRequestModel(requestPayload);

  if (!isMorphManagedResponsesModel(model)) {
    return null;
  }

  return withOtelSpan("morph.responses.route", {
    "axonrouter.morph.endpoint": "responses",
    "axonrouter.morph.requested_model": model,
  }, async () => {
    const morphSettings = await getConfiguredMorphSettings();
    if (!morphSettings) {
      return Response.json({ error: "Morph is not configured" }, { status: 503 });
    }

    const translatedRequest = await withOtelSpan("morph.responses.translate", {
      "axonrouter.morph.endpoint": "responses",
      "axonrouter.morph.requested_model": model,
    }, () => translateResponsesRequestToOpenAI(requestPayload));
    const autoResolution = await withOtelSpan("morph.responses.auto_resolve", {
      "axonrouter.morph.endpoint": "responses",
      "axonrouter.morph.requested_model": model,
    }, () => resolveMorphAutoModel({
      payload: translatedRequest,
      morphSettings,
      context: { endpoint: "responses" },
    }));
    if (shouldPreflightRejectMorphContext(autoResolution)) {
      return createMorphContextLengthPreflightResponse({
        model: autoResolution.resolvedModel,
        estimatedTokens: autoResolution.estimatedTokens,
        requiredContext: autoResolution.requiredContext,
        selectedContextWindow: autoResolution.selectedContextWindow,
        selectedContextMeta: autoResolution.selectedContextMeta,
      });
    }
    const routedRequest = await withOtelSpan("morph.responses.route_resolution", {
      "axonrouter.morph.endpoint": "responses",
      "axonrouter.morph.resolved_model": autoResolution.resolvedModel || "",
    }, () => applyMorphAutoResolution(
      translatedRequest,
      autoResolution,
    ));
    const fastApplyIntercept = await withOtelSpan("morph.responses.fast_apply_intercept", {
      "axonrouter.morph.endpoint": "responses",
    }, () => maybeBuildMorphFastApplyPayload(
      routedRequest,
      morphSettings,
    ));
    const compactedRequest = fastApplyIntercept.intercept
      ? fastApplyIntercept.requestPayload
      : await withOtelSpan("morph.responses.compact_payload", {
        "axonrouter.morph.endpoint": "responses",
      }, () => maybeCompactCleanApplyPayload(routedRequest, morphSettings));
    const upstreamResponse = await dispatchMorphCapability({
      capability: "apply",
      req,
      morphSettings,
      requestPayload: compactedRequest,
      requestBody: JSON.stringify(compactedRequest),
      requestLabel: fastApplyIntercept.intercept
        ? "morph:v1-responses:fast-apply"
        : "morph:v1-responses",
    });

    return withOtelSpan("morph.responses.translate_response", {
      "axonrouter.morph.endpoint": "responses",
      "axonrouter.morph.fast_apply_intercept": fastApplyIntercept.intercept === true,
    }, () => translateOpenAIResponseToResponses(
      upstreamResponse,
      model.replace(/^morph\//, ""),
      requestPayload?.stream === true,
    ));
  });
}

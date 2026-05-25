import {
  cloneResponseHeadersWithoutLength,
  createMorphReasoningEventTransformer,
  normalizeMorphReasoningMessage,
} from "@/lib/morph/reasoning";

function fallbackReasoningOnlyChoice(choice, normalizedMessage) {
  if (!choice || typeof choice !== "object") return choice;
  if (!normalizedMessage || typeof normalizedMessage !== "object")
    return choice;

  const cleanedContent =
    typeof normalizedMessage.content === "string"
      ? normalizedMessage.content.trim()
      : "";
  const cleanedReasoning =
    typeof normalizedMessage.reasoning_content === "string"
      ? normalizedMessage.reasoning_content.trim()
      : "";

  // Some Morph Qwen variants can exhaust a short max_tokens budget entirely in
  // reasoning, leaving content empty with finish_reason=length. Surface the
  // reasoning text as visible fallback so the caller does not treat the turn as blank.
  if (
    !cleanedContent &&
    cleanedReasoning &&
    choice.finish_reason === "length"
  ) {
    return {
      ...normalizedMessage,
      content: cleanedReasoning,
    };
  }

  return normalizedMessage;
}

export function normalizeMorphChatJsonPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (!Array.isArray(payload.choices)) return payload;

  const nextChoices = payload.choices.map((choice) => {
    if (!choice || typeof choice !== "object") return choice;
    const message = choice.message;
    if (!message || typeof message !== "object") return choice;

    const normalizedMessage = fallbackReasoningOnlyChoice(
      choice,
      normalizeMorphReasoningMessage(message),
    );
    if (normalizedMessage === message) return choice;
    if (
      normalizedMessage.content === message.content &&
      normalizedMessage.reasoning_content === message.reasoning_content
    ) {
      return choice;
    }

    return {
      ...choice,
      message: normalizedMessage,
    };
  });

  return {
    ...payload,
    choices: nextChoices,
  };
}

export async function normalizeMorphChatResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    if (!response.body) {
      console.error(
        "[morph-think] SSE response missing body during normalization",
        {
          status: response.status,
          contentType,
        },
      );
      return response;
    }

    try {
      const reasoningTransformer = createMorphReasoningEventTransformer();
      const transformed = response.body.pipeThrough(reasoningTransformer);

      // Wrap in a final stream that guarantees [DONE] is sent on any termination
      const encoder = new TextEncoder();
      let sentDone = false;
      const safeStream = transformed.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            // Check if this chunk contains [DONE]
            const text = new TextDecoder().decode(chunk, { stream: true });
            if (text.includes("[DONE]")) {
              sentDone = true;
            }
            controller.enqueue(chunk);
          },
          flush(controller) {
            // If upstream closed without [DONE], send it so clients know stream ended
            if (!sentDone) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            }
          },
        }),
      );

      return new Response(safeStream, {
        status: response.status,
        statusText: response.statusText,
        headers: cloneResponseHeadersWithoutLength(response.headers),
      });
    } catch (error) {
      console.error(
        "[morph-think] Failed to attach SSE normalization transformer",
        {
          status: response.status,
          contentType,
          error: error?.message || String(error),
        },
      );
      return response;
    }
  }

  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    const normalized = normalizeMorphChatJsonPayload(parsed);
    return new Response(JSON.stringify(normalized), {
      status: response.status,
      statusText: response.statusText,
      headers: cloneResponseHeadersWithoutLength(response.headers),
    });
  } catch {
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: cloneResponseHeadersWithoutLength(response.headers),
    });
  }
}

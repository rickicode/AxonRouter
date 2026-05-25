function normalizeReasoningText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function splitMorphThinkBlocks(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { content: text, reasoning: null };
  }

  const reasoningParts = [];
  let content = text.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => {
    const normalized = normalizeReasoningText(String(inner || ""));
    if (normalized) reasoningParts.push(normalized);
    return "";
  }).trim();

  const openOnlyIndex = content.toLowerCase().indexOf("<think>");
  if (openOnlyIndex !== -1) {
    const beforeThink = content.slice(0, openOnlyIndex).trim();
    const trailingReasoning = normalizeReasoningText(content.slice(openOnlyIndex + 7));
    if (trailingReasoning) reasoningParts.push(trailingReasoning);
    content = beforeThink;
  }

  return {
    content,
    reasoning: reasoningParts.length > 0 ? reasoningParts.join("\n\n") : null,
  };
}

export function normalizeMorphReasoningMessage(message) {
  if (!message || typeof message !== "object") return message;

  const { content, reasoning } = splitMorphThinkBlocks(message.content);
  const existingReasoning = normalizeReasoningText(message.reasoning_content || "");
  const finalReasoning = existingReasoning || reasoning || null;

  return {
    ...message,
    content: typeof content === "string" && content.length > 0 ? content : null,
    ...(finalReasoning ? { reasoning_content: finalReasoning } : {}),
  };
}

export function cloneResponseHeadersWithoutLength(headers) {
  const nextHeaders = new Headers(headers);
  nextHeaders.delete("content-length");
  return nextHeaders;
}

function createMorphStreamState() {
  return {
    inThink: false,
  };
}

function consumeMorphStreamContent(text, state) {
  if (typeof text !== "string" || text.length === 0) {
    return { content: text, reasoning: null };
  }

  let remaining = text;
  let visible = "";
  const reasoningParts = [];

  while (remaining.length > 0) {
    if (state.inThink) {
      const closeIndex = remaining.toLowerCase().indexOf("</think>");
      if (closeIndex === -1) {
        reasoningParts.push(remaining);
        remaining = "";
        break;
      }

      reasoningParts.push(remaining.slice(0, closeIndex));
      remaining = remaining.slice(closeIndex + 8);
      state.inThink = false;
      continue;
    }

    const openIndex = remaining.toLowerCase().indexOf("<think>");
    if (openIndex === -1) {
      visible += remaining;
      remaining = "";
      break;
    }

    visible += remaining.slice(0, openIndex);
    remaining = remaining.slice(openIndex + 7);
    state.inThink = true;
  }

  const reasoning = reasoningParts
    .map((part) => (typeof part === "string" ? part : ""))
    .join("");

  return {
    content: visible,
    reasoning: reasoning || null,
  };
}

function normalizeSseEventBlock(block, state) {
  if (!block) return "";

  const lines = block.split(/\r?\n/);
  const nextLines = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) {
      nextLines.push(line);
      continue;
    }

    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") {
      nextLines.push(line);
      continue;
    }

    try {
      const parsed = JSON.parse(data);
      const delta = parsed?.choices?.[0]?.delta;
      if (delta?.content && typeof delta.content === "string") {
        const originalContent = delta.content;
        const { content, reasoning } = consumeMorphStreamContent(originalContent, state);
        if (reasoning || content !== originalContent) {
          delta.content = content || "";
          if (reasoning) {
            delta.reasoning_content = `${delta.reasoning_content || ""}${reasoning}`;
          }
          nextLines.push(`data: ${JSON.stringify(parsed)}`);
          continue;
        }
      }
    } catch (error) {
      console.error("[morph-think] Failed to normalize SSE event line", {
        error: error?.message || String(error),
        preview: data.slice(0, 300),
      });
      nextLines.push(line);
      continue;
    }

    nextLines.push(line);
  }

  return nextLines.join("\n");
}

export function createMorphReasoningEventTransformer() {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  const state = createMorphStreamState();

  function emitCompleteBlocks(controller) {
    while (true) {
      const normalized = buffer.replace(/\r\n/g, "\n");
      const separatorIndex = normalized.indexOf("\n\n");
      if (separatorIndex === -1) {
        buffer = normalized;
        return;
      }

      const eventBlock = normalized.slice(0, separatorIndex);
      buffer = normalized.slice(separatorIndex + 2);
      const normalizedBlock = normalizeSseEventBlock(eventBlock, state);
      controller.enqueue(encoder.encode(`${normalizedBlock}\n\n`));
    }
  }

  return new TransformStream({
    transform(chunk, controller) {
      try {
        buffer += decoder.decode(chunk, { stream: true });
        emitCompleteBlocks(controller);
      } catch (error) {
        // Graceful: pass through the raw chunk instead of killing the stream.
        // The client still gets data even if think-block normalization fails.
        console.error("[morph-think] Transform stream chunk failed, passing through", {
          error: error?.message || String(error),
        });
        controller.enqueue(chunk);
      }
    },
    flush(controller) {
      try {
        buffer += decoder.decode();
        if (buffer.length > 0) {
          const normalizedBlock = normalizeSseEventBlock(buffer.replace(/\r\n/g, "\n"), state);
          controller.enqueue(encoder.encode(normalizedBlock));
        }
      } catch (error) {
        // Graceful: flush remaining buffer as-is rather than dropping it.
        console.error("[morph-think] Transform stream flush failed, emitting raw buffer", {
          error: error?.message || String(error),
        });
        if (buffer.length > 0) {
          controller.enqueue(encoder.encode(buffer));
        }
      }
    },
  });
}

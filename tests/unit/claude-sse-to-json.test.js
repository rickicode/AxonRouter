import { describe, expect, it } from "vitest";
import { parseSSEToOpenAIResponse } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";

describe("parseSSEToOpenAIResponse with Anthropic Claude SSE", () => {
  it("converts Claude message/content_block_delta stream to OpenAI chat completion", () => {
    const raw = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","model":"union-alpha","content":[],"usage":{"input_tokens":10,"output_tokens":0}}}',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"world!"}}',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":10,"output_tokens":5}}',
      'event: message_stop',
      'data: {"type":"message_stop"}'
    ].join("\n");

    const result = parseSSEToOpenAIResponse(raw, "union-alpha");
    expect(result).toBeTruthy();
    expect(result.id).toBe("msg_123");
    expect(result.model).toBe("union-alpha");
    expect(result.choices[0].message.content).toBe("Hello world!");
    expect(result.choices[0].finish_reason).toBe("stop");
    expect(result.usage.prompt_tokens).toBe(20);
    expect(result.usage.completion_tokens).toBe(5);
  });
});

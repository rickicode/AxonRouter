import { describe, expect, it } from "vitest";
import { extractUsage } from "../../open-sse/utils/usageTracking";

describe("extractUsage", () => {
  it("preserves total and reasoning tokens for Claude message_delta usage", () => {
    const usage = extractUsage({
      type: "message_delta",
      usage: {
        input_tokens: 120,
        output_tokens: 45,
        total_tokens: 300,
        cache_read_input_tokens: 90,
        cache_creation_input_tokens: 30,
        reasoning_tokens: 15,
      },
    });

    expect(usage).toEqual({
      prompt_tokens: 120,
      completion_tokens: 45,
      total_tokens: 300,
      cache_read_input_tokens: 90,
      cache_creation_input_tokens: 30,
      reasoning_tokens: 15,
      prompt_tokens_details: {
        cached_tokens: 90,
      },
      completion_tokens_details: {
        reasoning_tokens: 15,
      },
    });
  });
});

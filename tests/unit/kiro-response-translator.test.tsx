import { describe, expect, it } from "vitest";

import { convertKiroToOpenAI } from "../../open-sse/translator/response/kiro-to-openai.tsx";

describe("Kiro response translator", () => {
  it("passes through already-translated OpenAI chunks", () => {
    const chunk = {
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
    };

    expect(convertKiroToOpenAI(chunk, {})).toBe(chunk);
  });

  it("converts reasoning content into thinking blocks", () => {
    const state = { model: "kiro-model" };
    const result = convertKiroToOpenAI(
      'event: reasoningContentEvent\ndata: {"content":"step by step"}',
      state
    );

    expect(result.choices[0].delta.role).toBe("assistant");
    expect(result.choices[0].delta.content).toBe("<thinking>step by step</thinking>");
  });

  it("converts tool use events into OpenAI tool calls", () => {
    const state = { model: "kiro-model" };
    const result = convertKiroToOpenAI(
      {
        _eventType: "toolUseEvent",
        toolUseId: "call_1",
        name: "read_file",
        input: { path: "/tmp/demo.txt" },
      },
      state
    );

    expect(result.choices[0].delta.tool_calls).toEqual([
      {
        index: 0,
        id: "call_1",
        type: "function",
        function: {
          name: "read_file",
          arguments: '{"path":"/tmp/demo.txt"}',
        },
      },
    ]);
  });

  it("stores usage events and injects usage into the final chunk", () => {
    const state = { model: "kiro-model" };

    expect(
      convertKiroToOpenAI(
        {
          _eventType: "usageEvent",
          inputTokens: 11,
          outputTokens: 13,
        },
        state
      )
    ).toBeNull();

    const result = convertKiroToOpenAI(
      { _eventType: "messageStopEvent" },
      state
    );

    expect(result.choices[0].finish_reason).toBe("stop");
    expect(result.usage).toEqual({
      prompt_tokens: 11,
      completion_tokens: 13,
      total_tokens: 24,
    });
  });
});

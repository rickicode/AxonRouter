import { describe, expect, it } from "vitest";

import { normalizeMorphChatJsonPayload, normalizeMorphChatResponse } from "../../src/app/api/v1/_morphThink.ts";
import { splitMorphThinkBlocks } from "../../src/lib/morph/reasoning.tsx";

function makeSseResponse(chunks) {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Content-Length": "999",
    },
  });
}

describe("Morph think normalization", () => {
  it("splits think blocks into clean content and reasoning", () => {
    expect(splitMorphThinkBlocks("<think>plan</think>answer")).toEqual({
      content: "answer",
      reasoning: "plan",
    });
  });

  it("moves non-stream think blocks into reasoning_content", () => {
    const payload = normalizeMorphChatJsonPayload({
      choices: [{
        message: {
          content: "<think>inspect file</think>Potential bug found",
        },
      }],
    });

    expect(payload.choices[0].message).toEqual({
      content: "Potential bug found",
      reasoning_content: "inspect file",
    });
  });

  it("moves unterminated think blocks into reasoning_content", () => {
    const payload = normalizeMorphChatJsonPayload({
      choices: [{
        message: {
          content: "<think>The user is asking me to reply with ok",
        },
      }],
    });

    expect(payload.choices[0].message).toEqual({
      content: null,
      reasoning_content: "The user is asking me to reply with ok",
    });
  });

  it("falls back to reasoning text when Morph returns reasoning-only length truncation", () => {
    const payload = normalizeMorphChatJsonPayload({
      choices: [{
        finish_reason: "length",
        message: {
          content: null,
          reasoning_content: "Thinking Process:\n\n1. Reply with ok",
        },
      }],
    });

    expect(payload.choices[0].message).toEqual({
      content: "Thinking Process:\n\n1. Reply with ok",
      reasoning_content: "Thinking Process:\n\n1. Reply with ok",
    });
  });

  it("normalizes chunk-split SSE think payloads", async () => {
    const response = makeSseResponse([
      'data: {"choices":[{"delta":{"content":"<think>hel',
      'lo</think>done"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const normalized = await normalizeMorphChatResponse(response);
    const text = await normalized.text();

    expect(normalized.headers.get("content-length")).toBeNull();
    expect(text).toContain('"content":"done"');
    expect(text).toContain('"reasoning_content":"hello"');
    expect(text).toContain("data: [DONE]");
  });

  it("normalizes think streams split across multiple SSE events", async () => {
    const response = makeSseResponse([
      'data: {"choices":[{"delta":{"content":"<think>The"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" user"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"</think>Answer"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const normalized = await normalizeMorphChatResponse(response);
    const text = await normalized.text();

    expect(text).not.toContain('<think>');
    expect(text).not.toContain('</think>');
    expect(text).toContain('"reasoning_content":"The"');
    expect(text).toContain('"reasoning_content":" user"');
    expect(text).toContain('"content":"Answer"');
  });
});

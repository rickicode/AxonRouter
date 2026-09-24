import { describe, expect, it } from "vitest";

import { FORMATS } from "../../open-sse/translator/formats.js";
import { createSSETransformStreamWithLogger } from "../../open-sse/utils/stream.js";

/**
 * Upstream chunks -> client Responses API events.
 *
 * The converter under test is openaiToOpenAIResponsesResponse(), reached through
 * the registered OPENAI:OPENAI_RESPONSES pair. Without it, /v1/responses never
 * reports usage and Responses clients (Codex CLI) keep their context gauge at 0,
 * so they never auto-compact and eventually hit the upstream context limit.
 *
 * Signature is (targetFormat, sourceFormat, ...) — targetFormat is what the
 * UPSTREAM speaks, sourceFormat is what the CLIENT speaks.
 */
async function runTransform(chunks, targetFormat = FORMATS.OPENAI) {
  const encoder = new TextEncoder();
  const input = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("");

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(input));
      controller.close();
    },
  });

  const output = stream.pipeThrough(
    createSSETransformStreamWithLogger(
      targetFormat,
      FORMATS.OPENAI_RESPONSES,
      "deepseek",
      null,
      null,
      "deepseek-flash",
    ),
  );

  const reader = output.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

function completedEvents(output) {
  return output
    .split("\n")
    .filter((l) => l.startsWith("data: ") && l.includes('"type":"response.completed"'));
}

function completedResponse(output) {
  const lines = completedEvents(output);
  expect(lines.length, "expected exactly one response.completed").toBe(1);
  return JSON.parse(lines[0].slice(6)).response;
}

const TEXT_CHUNK = {
  id: "chatcmpl-test",
  object: "chat.completion.chunk",
  created: 1700000000,
  model: "deepseek-flash",
  choices: [{ index: 0, delta: { role: "assistant", content: "好" } }],
};

const FINISH_CHUNK = {
  id: "chatcmpl-test",
  object: "chat.completion.chunk",
  created: 1700000000,
  model: "deepseek-flash",
  choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
};

// Usage-only trailer: `choices` is empty, exactly as OpenAI emits it when
// stream_options.include_usage is set.
const USAGE_ONLY_CHUNK = {
  id: "chatcmpl-test",
  object: "chat.completion.chunk",
  created: 1700000000,
  model: "deepseek-flash",
  choices: [],
  usage: {
    prompt_tokens: 884,
    completion_tokens: 37,
    total_tokens: 921,
    prompt_tokens_details: { cached_tokens: 256 },
  },
};

const EXPECTED_USAGE = {
  input_tokens: 884,
  output_tokens: 37,
  total_tokens: 921,
  input_tokens_details: { cached_tokens: 256 },
};

describe("openai-responses: response.completed carries usage", () => {
  it("defers completion until the usage-only trailer and attaches usage", async () => {
    const output = await runTransform([TEXT_CHUNK, FINISH_CHUNK, USAGE_ONLY_CHUNK]);
    const completed = completedResponse(output);
    expect(completed.usage).toEqual(EXPECTED_USAGE);
    expect(completed.status).toBe("completed");
  });

  it("emits completion on flush when upstream never sends usage", async () => {
    const output = await runTransform([TEXT_CHUNK, FINISH_CHUNK]);
    const completed = completedResponse(output);
    expect(completed.usage).toBeUndefined();
    expect(completed.status).toBe("completed");
  });

  it("reads usage attached to the finish chunk itself", async () => {
    const finishWithUsage = {
      ...FINISH_CHUNK,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const output = await runTransform([TEXT_CHUNK, finishWithUsage]);
    const completed = completedResponse(output);
    expect(completed.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    });
  });
});

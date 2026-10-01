/**
 * opencode-go DeepSeek models on the Claude → Claude /messages passthrough need
 * the same thinking-block handling as the official deepseek provider (#3332):
 * keep existing thinking blocks verbatim, and inject an UNSIGNED thinking
 * placeholder on tool_use turns that carry none while thinking is enabled —
 * upstream 400s with "The content[].thinking in the thinking mode must be passed
 * back to the API" otherwise. The gate is model-based because opencode-go also
 * serves non-DeepSeek models over /messages (minimax, qwen) that must stay
 * untouched.
 *
 * AxonRouter hosts this at the dispatch boundary (OpenCodeGoExecutor.transformRequest,
 * Anthropic /messages branch) because prepareClaudeRequest's provider check treats
 * every non-"deepseek" provider as a plain anthropic-compatible one.
 */
import { describe, it, expect } from "vitest";
import { OpenCodeGoExecutor } from "../../open-sse/executors/opencode-go.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const MESSAGES_TRANSPORT = {
  format: "claude",
  baseUrl: "https://opencode.ai/zen/go/v1/messages",
  auth: { combined: true, header: "x-api-key", scheme: "raw" },
};
const CHAT_TRANSPORT = {
  format: "openai",
  baseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
  auth: { combined: true, header: "Authorization", scheme: "bearer" },
};

const executor = new OpenCodeGoExecutor();

function makeBody(model) {
  return {
    model,
    max_tokens: 2048,
    thinking: { type: "enabled", budget_tokens: 1024 },
    messages: [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "let me check" },
          { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Paris" } },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "18C" }] },
    ],
  };
}

function run(model, transport, mutate) {
  const body = makeBody(model);
  if (mutate) mutate(body);
  return executor.transformRequest(model, body, true, { apiKey: "x", runtimeTransport: transport });
}

function assistantBlocks(out) {
  return out.messages.find((m) => m.role === "assistant").content;
}

describe("OpenCodeGoExecutor — DeepSeek /messages thinking pass-back", () => {
  it("injects an unsigned thinking placeholder on tool_use turns missing one", () => {
    const out = run("deepseek-v4-pro(max)", MESSAGES_TRANSPORT);

    const thinking = assistantBlocks(out).filter((b) => b.type === "thinking");
    expect(thinking).toHaveLength(1);
    expect(thinking[0].signature).toBeUndefined();
    expect(assistantBlocks(out)).toHaveLength(3); // placeholder + text + tool_use
  });

  it("keeps an existing thinking block verbatim (no re-sign, no duplicate)", () => {
    const realThinking = { type: "thinking", thinking: "actual reasoning", signature: "sig_from_upstream" };
    const out = run("deepseek-v4-flash", MESSAGES_TRANSPORT, (b) => {
      b.messages[1].content.unshift(realThinking);
    });

    const thinking = assistantBlocks(out).filter((b) => b.type === "thinking");
    expect(thinking).toHaveLength(1);
    expect(thinking[0]).toEqual(realThinking);
  });

  it("leaves non-DeepSeek opencode-go models untouched (minimax rides /messages too)", () => {
    const out = run("minimax-m3", MESSAGES_TRANSPORT);
    expect(assistantBlocks(out).some((b) => b.type === "thinking")).toBe(false);
  });

  it("does not inject when thinking is disabled", () => {
    const out = run("deepseek-v4-pro", MESSAGES_TRANSPORT, (b) => {
      b.thinking = { type: "disabled" };
    });
    expect(assistantBlocks(out).some((b) => b.type === "thinking")).toBe(false);
  });

  it("does not inject on the /chat/completions (openai) transport", () => {
    const out = run("deepseek-v4-pro", CHAT_TRANSPORT);
    expect(assistantBlocks(out).some((b) => b.type === "thinking")).toBe(false);
  });

  it("does not inject when the request is a trailing-assistant prefill", () => {
    const out = run("deepseek-v4-pro", MESSAGES_TRANSPORT, (b) => {
      b.messages.push({ role: "assistant", content: [{ type: "text", text: "sure" }] });
    });
    const prefilled = out.messages[out.messages.length - 2];
    expect(prefilled.content.some((b) => b.type === "thinking")).toBe(false);
  });

  it("end-to-end: claude→claude opencode-go translation reaches /messages with the placeholder", () => {
    const translated = translateRequest(
      FORMATS.CLAUDE,
      FORMATS.CLAUDE,
      "deepseek-v4-pro",
      makeBody("deepseek-v4-pro"),
      true,
      { apiKey: "x" },
      "opencode-go",
      null,
      [],
      "conn",
      "claude",
    );
    const out = executor.transformRequest("deepseek-v4-pro", translated, true, {
      apiKey: "x",
      runtimeTransport: MESSAGES_TRANSPORT,
    });
    const thinking = assistantBlocks(out).filter((b) => b.type === "thinking");
    expect(thinking).toHaveLength(1);
    expect(thinking[0].signature).toBeUndefined();
  });
});
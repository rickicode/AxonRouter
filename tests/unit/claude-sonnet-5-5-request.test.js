// Ported from upstream 9router: 49ba54b2 (Sonnet 5.5), ccd0677d (adaptive thinking),
// 7894f3d3 (xhigh), 75834e96 + 5e9bd464 (trailing user turn / prefill), 49c761cd (4th cache marker).
import { describe, expect, it } from "vitest";

import { getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";
import {
  anchorClaudeCache,
  normalizeClaudePassthrough,
  prepareClaudeRequest,
} from "../../open-sse/translator/formats/claude.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import "../translator/registerAll.js";

const roles = (body) => body.messages.map((m) => m.role);
const history = (last) => [
  { role: "user", content: "hi" },
  { role: "assistant", content: [{ type: "text", text: "hello" }] },
  last,
];

describe("Claude Sonnet 5.5 registry/capabilities/pricing", () => {
  it("is listed for the claude provider", () => {
    expect(getModelsByProviderId("claude").some((model) => model.id === "claude-sonnet-5-5")).toBe(true);
  });

  it("resolves to adaptive thinking with a 1M context", () => {
    expect(getCapabilitiesForModel("claude", "claude-sonnet-5-5")).toMatchObject({
      reasoning: true,
      thinkingFormat: "claude-adaptive",
      contextWindow: 1000000,
      maxOutput: 128000,
    });
  });

  it.each(["claude-sonnet-5-5", "claude-sonnet-5"])("prices %s at Sonnet 5 rates", (model) => {
    expect(getPricingForModel("claude", model)).toEqual({
      input: 2, output: 10, cached: 0.2, reasoning: 10, cache_creation: 2.5,
    });
  });
});

// Sonnet 5.5 returns 400 for thinking.type "disabled" and for forced tool use.
describe("Claude Sonnet 5.5 request shape", () => {
  const prepare = (body) =>
    prepareClaudeRequest({ max_tokens: 1024, messages: [{ role: "user", content: "hi" }], ...body }, "claude");

  it("turns thinking off with between_tools, clamping effort to high", () => {
    const body = prepare({ model: "claude-sonnet-5-5", thinking: { type: "disabled" }, output_config: { effort: "max" } });
    expect(body.thinking).toEqual({ type: "between_tools" });
    expect(body.output_config.effort).toBe("high");
  });

  it("maps forced tool_choice to auto", () => {
    expect(prepare({ model: "claude-sonnet-5-5", tool_choice: { type: "any" } }).tool_choice).toEqual({ type: "auto" });
    expect(
      prepare({ model: "claude-sonnet-5-5", tool_choice: { type: "tool", name: "run", disable_parallel_tool_use: true } }).tool_choice,
    ).toEqual({ type: "auto", disable_parallel_tool_use: true });
  });

  it("leaves other models untouched", () => {
    const body = prepare({ model: "claude-sonnet-5", thinking: { type: "disabled" }, tool_choice: { type: "any" } });
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.tool_choice).toEqual({ type: "any" });
  });

  it("covers the native Claude passthrough path end to end", () => {
    const out = translateRequest(
      FORMATS.CLAUDE, FORMATS.CLAUDE, "claude-sonnet-5-5",
      {
        model: "claude-sonnet-5-5", max_tokens: 1000, thinking: { type: "disabled" }, tool_choice: { type: "any" },
        tools: [{ name: "run", input_schema: { type: "object", properties: {} } }],
        messages: [{ role: "user", content: "hi" }],
      },
      true, null, "claude",
    );
    expect(out.thinking).toEqual({ type: "between_tools" });
    expect(out.tool_choice).toEqual({ type: "auto" });
  });
});

// Anthropic rejects a body ending on an assistant turn ("This model does not support
// assistant message prefill"). Cleanup passes delete emptied messages, so an emptied
// trailing user turn used to leave the previous assistant turn last.
const emptyLastTurns = {
  "empty string": { role: "user", content: "" },
  "blank text block": { role: "user", content: [{ type: "text", text: "  " }] },
  "empty content array": { role: "user", content: [] },
  "unsupported block only": { role: "user", content: [{ type: "search_result", source: "x", title: "t", content: [] }] },
};

describe("trailing user turn survives empty-message cleanup", () => {
  for (const [name, last] of Object.entries(emptyLastTurns)) {
    it(`prepareClaudeRequest: ${name}`, () => {
      const out = prepareClaudeRequest({ model: "claude-opus-4-5", max_tokens: 100, messages: history(last) }, "claude");
      expect(roles(out)).toEqual(["user", "assistant", "user"]);
    });
    it(`normalizeClaudePassthrough: ${name}`, () => {
      const out = normalizeClaudePassthrough({ model: "claude-opus-4-5", messages: history(last) }, "claude-opus-4-5");
      expect(roles(out)).toEqual(["user", "assistant", "user"]);
    });
  }

  it("passthrough: tool_result of a dropped foreign server_tool_use no longer empties the last turn into prefill", () => {
    const out = normalizeClaudePassthrough(
      {
        model: "claude-opus-4-5",
        messages: [
          { role: "user", content: "analyze" },
          { role: "assistant", content: [{ type: "server_tool_use", id: "call_abc", name: "analyze_image", input: {} }, { type: "text", text: "done" }] },
          { role: "user", content: [{ type: "web_search_tool_result", tool_use_id: "call_abc", content: [] }] },
        ],
      },
      "claude-opus-4-5",
    );
    expect(roles(out)).toEqual(["user", "assistant", "user"]);
  });

  it("leaves intentional client prefill (last turn is assistant) untouched", () => {
    const body = {
      model: "claude-opus-4-5", max_tokens: 100,
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: [{ type: "text", text: "Sure:" }] },
      ],
    };
    expect(roles(prepareClaudeRequest(structuredClone(body), "claude"))).toEqual(["user", "assistant"]);
    expect(roles(normalizeClaudePassthrough(structuredClone(body), "claude-opus-4-5"))).toEqual(["user", "assistant"]);
  });

  it("does not append anything when the last user turn has content", () => {
    const out = prepareClaudeRequest({ model: "claude-opus-4-5", max_tokens: 100, messages: history({ role: "user", content: "next" }) }, "claude");
    expect(roles(out)).toEqual(["user", "assistant", "user"]);
    expect(out.messages.at(-1).content[0].text).toBe("next");
  });

  it("full pipeline: OpenAI client with an empty last user message", () => {
    const out = translateRequest(
      "openai", "claude", "claude-opus-4-5",
      {
        model: "x", max_tokens: 100,
        messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }, { role: "user", content: "" }],
      },
      true, null, "claude",
    );
    expect(out.messages.at(-1).role).toBe("user");
  });
});

// Non-messages[] sources (Gemini contents[], Responses input[]) carry the client's
// terminal role in their own shape. An explicit trailing model/assistant turn is real
// prefill and must survive translation to Claude; an emptied trailing user turn must
// still get the "Continue." restoration.
describe("trailing user turn: non-messages[] source formats", () => {
  it("keeps a Gemini trailing model turn (real prefill)", () => {
    const out = translateRequest("gemini", "claude", "claude-sonnet-4-5", {
      contents: [
        { role: "user", parts: [{ text: "hi" }] },
        { role: "model", parts: [{ text: "The answer is" }] },
      ],
    }, false);
    expect(roles(out)).toEqual(["user", "assistant"]);
  });

  it("keeps a Responses trailing assistant message (real prefill)", () => {
    const out = translateRequest("openai-responses", "claude", "claude-sonnet-4-5", {
      model: "claude-sonnet-4-5",
      input: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "The answer is" },
      ],
    }, false);
    expect(roles(out)).toEqual(["user", "assistant"]);
  });

  it("still restores a user turn when a Gemini trailing user turn is emptied", () => {
    const out = translateRequest("gemini", "claude", "claude-sonnet-4-5", {
      contents: [
        { role: "user", parts: [{ text: "hi" }] },
        { role: "model", parts: [{ text: "hello" }] },
        { role: "user", parts: [] },
      ],
    }, false);
    expect(roles(out)).toEqual(["user", "assistant", "user"]);
  });
});

// A tool loop's request ends with the last assistant turn's tool results, after that turn's
// breakpoint: without a 4th breakpoint on them they go at the full input price, and are written
// into the cache only by the next request, which appends to them.
const CC = { type: "ephemeral" };
const text = (t, extra = {}) => ({ type: "text", text: t, ...extra });
const tool = (name, extra = {}) => ({ name, description: "d", input_schema: { type: "object", properties: {} }, ...extra });
const use = (id) => ({ role: "assistant", content: [text("Reading."), { type: "tool_use", id, name: "read_file", input: { path: "a" } }] });
const result = (id, content = "file") => ({ type: "tool_result", tool_use_id: id, content });

function markers(body) {
  const out = [];
  (body.system || []).forEach((b, i) => b?.cache_control && out.push(`system[${i}]`));
  (body.tools || []).forEach((t, i) => t?.cache_control && out.push(`tools[${i}]`));
  (body.messages || []).forEach((m, i) => Array.isArray(m?.content) && m.content.forEach((b, j) => b?.cache_control && out.push(`messages[${i}].${j}`)));
  return out;
}

const loop = () => ({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  system: [text("You are an agent.")],
  tools: [tool("read_file"), tool("run_command")],
  messages: [
    { role: "user", content: [text("Fix the bug.")] },
    use("t1"),
    { role: "user", content: [result("t1")] },
    use("t2"),
    { role: "user", content: [result("t2", "a"), result("t2b", "b")] },
  ],
});

describe("prepareClaudeRequest: a tool loop's final tool results", () => {
  it("get the 4th breakpoint, after the last assistant turn's", () => {
    const out = prepareClaudeRequest(loop(), "claude");
    expect(markers(out)).toEqual(["system[0]", "tools[1]", "messages[3].1", "messages[4].1"]);
    expect(out.messages[4].content[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("leave a request that ends with a typed message as it was", () => {
    const body = loop();
    body.messages.push({ role: "assistant", content: [text("Done.")] }, { role: "user", content: [text("Thanks, and the tests?")] });
    const out = prepareClaudeRequest(body, "claude");
    expect(markers(out)).toEqual(["system[0]", "tools[1]", "messages[5].0"]);
  });

  it("need no tools array to be marked", () => {
    const body = loop();
    delete body.tools;
    const out = prepareClaudeRequest(body, "claude");
    expect(markers(out)).toEqual(["system[0]", "messages[3].1", "messages[4].1"]);
  });
});

describe("anchorClaudeCache: a passthrough tool loop's final tool results", () => {
  it("are re-anchored with the last assistant turn", () => {
    const out = anchorClaudeCache(loop());
    expect(markers(out)).toEqual(["system[0]", "tools[1]", "messages[3].1", "messages[4].1"]);
  });

  it("never exceed four markers when the client already spent its budget", () => {
    const body = loop();
    body.system = [text("a", { cache_control: CC }), text("b", { cache_control: CC })];
    body.tools = body.tools.map((t) => ({ ...t, cache_control: CC }));
    body.messages.forEach((m) => m.content.forEach((b) => (b.cache_control = CC)));
    const out = anchorClaudeCache(body);
    expect(markers(out).length).toBeLessThanOrEqual(4);
  });
});
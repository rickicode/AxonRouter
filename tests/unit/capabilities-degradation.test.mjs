import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveRequiredCapabilities,
  degradeRequestForCapabilities,
} from "../../open-sse/translator/concerns/capabilitiesDegradation.js";
import { reorderByCapabilities } from "../../open-sse/services/combo.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("Capability Degradation Concern", () => {
  describe("deriveRequiredCapabilities", () => {
    it("returns empty set for plain text request", () => {
      const body = {
        messages: [{ role: "user", content: "hello world" }],
      };
      const req = deriveRequiredCapabilities(body);
      assert.equal(req.size, 0);
    });

    it("detects vision, audioInput, and pdf modalities across formats", () => {
      const openai = {
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: "https://example.com/a.png" } },
              { type: "input_audio", input_audio: { data: "abc", format: "wav" } },
              { type: "file", file: { file_data: "data:application/pdf;base64,123" } },
            ],
          },
        ],
      };
      const req = deriveRequiredCapabilities(openai);
      assert.equal(req.has("vision"), true);
      assert.equal(req.has("audioInput"), true);
      assert.equal(req.has("pdf"), true);
    });

    it("detects tools declared at top level and in message history", () => {
      // Top level
      const bodyWithTools = {
        tools: [{ type: "function", function: { name: "get_weather" } }],
        messages: [{ role: "user", content: "weather in Tokyo?" }],
      };
      assert.equal(deriveRequiredCapabilities(bodyWithTools).has("tools"), true);

      // History with tool_calls and tool role
      const bodyWithHistory = {
        messages: [
          { role: "user", content: "what time is it?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "c1", function: { name: "get_time", arguments: "{}" } }],
          },
          { role: "tool", tool_call_id: "c1", content: "12:00 PM" },
        ],
      };
      assert.equal(deriveRequiredCapabilities(bodyWithHistory).has("tools"), true);
    });

    it("detects reasoning from reasoning_effort or thinking config", () => {
      assert.equal(deriveRequiredCapabilities({ reasoning_effort: "high" }).has("reasoning"), true);
      assert.equal(deriveRequiredCapabilities({ thinking: { type: "enabled" } }).has("reasoning"), true);
      assert.equal(deriveRequiredCapabilities({ reasoning: { effort: "low" } }).has("reasoning"), true);
    });

    it("detects web search from tools or parameter", () => {
      const body = {
        tools: [{ type: "web_search" }],
      };
      assert.equal(deriveRequiredCapabilities(body).has("search"), true);
      assert.equal(deriveRequiredCapabilities({ web_search: true }).has("search"), true);
    });
  });

  describe("degradeRequestForCapabilities", () => {
    it("degrades tools gracefully for OpenAI format", () => {
      const body = {
        tools: [{ type: "function", function: { name: "calc" } }],
        tool_choice: "auto",
        parallel_tool_calls: true,
        messages: [
          { role: "user", content: "Calculate 2+2" },
          {
            role: "assistant",
            content: "I will calculate that.",
            tool_calls: [
              { function: { name: "calc", arguments: '{"expr":"2+2"}' } },
            ],
          },
          { role: "tool", name: "calc", tool_call_id: "call_1", content: "4" },
          { role: "user", content: "Now multiply by 3" },
        ],
      };

      const caps = { tools: false, reasoning: false, vision: true, audioInput: true, pdf: true };
      const res = degradeRequestForCapabilities(body, FORMATS.OPENAI, caps);

      assert.equal(res.degraded, true);
      assert.equal(res.degradedCapabilities.includes("tools"), true);
      assert.equal(body.tools, undefined);
      assert.equal(body.tool_choice, undefined);
      assert.equal(body.parallel_tool_calls, undefined);

      // Assistant tool calls converted to transcript
      const asst = body.messages[1];
      assert.equal(asst.tool_calls, undefined);
      assert.match(asst.content, /\[Tool Call: calc with args: \{"expr":"2\+2"\}\]/);

      // Tool role message converted to user transcript
      const toolTurn = body.messages[2];
      assert.equal(toolTurn.role, "user");
      assert.equal(toolTurn.tool_call_id, undefined);
      assert.match(toolTurn.content, /\[Tool Result \(calc\): 4\]/);
    });

    it("degrades Claude tools content blocks to text", () => {
      const body = {
        tools: [{ name: "lookup" }],
        messages: [
          {
            role: "assistant",
            content: [
              { type: "text", text: "Looking up:" },
              { type: "tool_use", name: "lookup", input: { id: 42 } },
            ],
          },
          {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "tu_1", content: "data found" },
            ],
          },
        ],
      };

      const caps = { tools: false, reasoning: false, vision: true, audioInput: true, pdf: true };
      const res = degradeRequestForCapabilities(body, FORMATS.CLAUDE, caps);

      assert.equal(res.degraded, true);
      assert.equal(body.tools, undefined);

      const asstBlocks = body.messages[0].content;
      assert.equal(asstBlocks.length, 2);
      assert.equal(asstBlocks[1].type, "text");
      assert.match(asstBlocks[1].text, /\[Tool Call: lookup with args: \{"id":42\}\]/);

      const userBlocks = body.messages[1].content;
      assert.equal(userBlocks[0].type, "text");
      assert.match(userBlocks[0].text, /\[Tool Result: data found\]/);
    });

    it("degrades reasoning when model lacks reasoning capability", () => {
      const body = {
        reasoning_effort: "high",
        thinking: { type: "enabled", budget_tokens: 2048 },
        messages: [
          { role: "user", content: "Deep question" },
          {
            role: "assistant",
            content: "Answer",
            reasoning_content: "My internal thought process...",
          },
        ],
      };

      const caps = { tools: true, reasoning: false, vision: true, audioInput: true, pdf: true };
      const res = degradeRequestForCapabilities(body, FORMATS.OPENAI, caps);

      assert.equal(res.degraded, true);
      assert.equal(res.degradedCapabilities.includes("reasoning"), true);
      assert.equal(body.reasoning_effort, undefined);
      assert.equal(body.thinking, undefined);
      assert.equal(body.messages[1].reasoning_content, undefined);
    });

    it("clamps output tokens when exceeding model maxOutput", () => {
      const body = {
        max_tokens: 16000,
        messages: [{ role: "user", content: "hi" }],
      };

      const caps = { tools: true, reasoning: true, maxOutput: 8192 };
      const res = degradeRequestForCapabilities(body, FORMATS.OPENAI, caps);

      assert.equal(res.degraded, true);
      assert.equal(body.max_tokens, 8192);
      assert.equal(res.degradedCapabilities.includes("clamp:max_tokens"), true);
    });
  });

  describe("Combo routing prioritization with tools capability", () => {
    it("prioritizes tool-capable models when request requires tools", () => {
      // gpt-image-1 has tools: false, whereas openai/gpt-4o has tools: true.
      const models = ["openai/gpt-image-1", "openai/gpt-4o"];
      const required = new Set(["tools"]);
      const reordered = reorderByCapabilities(models, required);

      assert.equal(reordered[0], "openai/gpt-4o");
      assert.equal(reordered.includes("openai/gpt-image-1"), true); // kept as fallback
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  getFunctionTools,
  matchToolByArgs,
  repairNamelessStreamingToolCalls,
  resolveNamelessTool,
  shouldDeferNamelessStart,
} from "../../open-sse/translator/concerns/toolCall.js";

const TOOLS = [
  { name: "glob", parameters: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] } },
  { name: "read", parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] } },
];

function ctx(tools = TOOLS) {
  return { tools, pending: new Map(), warned: false };
}

describe("streaming tool-name backfill (unikey gemini)", () => {
  it("fills name immediately when exactly one tool is defined", () => {
    const c = ctx([{ name: "glob", parameters: {} }]);
    const parsed = { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { arguments: "" } }] } }] };
    expect(repairNamelessStreamingToolCalls(parsed, c)).toBe(true);
    expect(parsed.choices[0].delta.tool_calls[0].function.name).toBe("glob");
  });

  it("leaves named calls untouched", () => {
    const c = ctx();
    const parsed = { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read", arguments: "" } }] } }] };
    expect(repairNamelessStreamingToolCalls(parsed, c)).toBe(false);
  });

  it("late-repairs unambiguous multi-tool call on finish chunk", () => {
    const c = ctx();
    const arg = { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { arguments: '{"filePath":"a.js"}' } }] } }] };
    expect(repairNamelessStreamingToolCalls(arg, c)).toBe(false);
    const fin = { choices: [{ delta: {}, finish_reason: "tool_calls" }] };
    expect(repairNamelessStreamingToolCalls(fin, c)).toBe(true);
    expect(fin.choices[0].delta.tool_calls).toEqual([{ index: 0, id: "call_1", function: { name: "read", arguments: "" } }]);
  });

  it("does not guess on ambiguous args", () => {
    const tools = [
      { name: "a", parameters: { type: "object", properties: { q: { type: "string" } }, required: [] } },
      { name: "b", parameters: { type: "object", properties: { q: { type: "string" } }, required: [] } },
    ];
    const c = ctx(tools);
    repairNamelessStreamingToolCalls({ choices: [{ delta: { tool_calls: [{ index: 0, id: "x", function: { arguments: '{"q":"hi"}' } }] } }] }, c);
    const fin = { choices: [{ delta: {}, finish_reason: "tool_calls" }] };
    expect(repairNamelessStreamingToolCalls(fin, c)).toBe(false);
    expect(fin.choices[0].delta.tool_calls).toBeUndefined();
  });

  it("does not guess on unparseable args", () => {
    const c = ctx();
    repairNamelessStreamingToolCalls({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "{oops" } }] } }] }, c);
    const fin = { choices: [{ delta: {}, finish_reason: "stop" }] };
    expect(repairNamelessStreamingToolCalls(fin, c)).toBe(false);
  });

  it("matchToolByArgs rejects extra unknown keys", () => {
    expect(matchToolByArgs('{"filePath":"a","bogus":1}', TOOLS)).toBe(null);
  });

  it("shouldDeferNamelessStart gates to unikey/gemini paths", () => {
    expect(shouldDeferNamelessStart("unikey", "anything")).toBe(true);
    expect(shouldDeferNamelessStart("openai", "google/gemini-3.5-flash")).toBe(true);
    expect(shouldDeferNamelessStart("openai", "gpt-5")).toBe(false);
    expect(shouldDeferNamelessStart("glm", "glm-4")).toBe(false);
  });

  it("resolveNamelessTool is deterministic for single tool, strict otherwise", () => {
    expect(resolveNamelessTool([{ name: "only", parameters: {} }], "{bad json")).toBe("only");
    expect(resolveNamelessTool(TOOLS, '{"filePath":"a.js"}')).toBe("read");
    expect(resolveNamelessTool(TOOLS, '{"nope":1}')).toBe(null);
    expect(resolveNamelessTool([], '{"a":1}')).toBe(null);
  });

  it("getFunctionTools extracts openai function tools", () => {
    const body = { tools: [{ type: "function", function: { name: "glob", parameters: { type: "object" } } }] };
    expect(getFunctionTools(body)).toEqual([{ name: "glob", parameters: { type: "object" } }]);
    expect(getFunctionTools({})).toEqual([]);
  });
});

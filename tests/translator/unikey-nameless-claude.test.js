// UniKey-fronted Gemini streams OpenAI deltas with id+arguments but no
// function.name. The Claude response path must never emit tool_use with
// name:"" (strict clients reject it as invalid tool call): defer the start
// until the name is known, resolve at finish, or drop the block.
import { describe, it, expect } from "vitest";
import "./registerAll.js";
import { translateResponse, initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const TOOLS = [
  { name: "glob", parameters: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] } },
  { name: "read", parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] } },
];

function unikeyState(tools = TOOLS) {
  const s = initState(FORMATS.CLAUDE);
  s.provider = "unikey";
  s.model = "gemini-3.5-flash";
  s.functionTools = tools;
  return s;
}

function runAll(state, events) {
  const out = [];
  for (const ev of events) {
    const r = translateResponse(FORMATS.OPENAI, FORMATS.CLAUDE, ev, state);
    if (Array.isArray(r)) out.push(...r);
    else if (r) out.push(r);
  }
  return out;
}

const idChunk = (id) => ({ id: "chatcmpl-x", model: "gemini-3.5-flash",
  choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: {} }] } }] });
const argsChunk = (args) => ({ id: "chatcmpl-x", model: "gemini-3.5-flash",
  choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: args } }] } }] });
const finishChunk = (reason = "tool_calls") => ({ id: "chatcmpl-x", model: "gemini-3.5-flash",
  choices: [{ delta: {}, finish_reason: reason }] });

describe("unikey nameless streaming -> claude", () => {
  it("defers start and emits valid tool_use at finish (single tool)", () => {
    const state = unikeyState([{ name: "glob", parameters: {} }]);
    const out = runAll(state, [
      idChunk("call_1"),
      argsChunk('{"pattern":"*combo*"}'),
      finishChunk(),
    ]);
    const starts = out.filter((c) => c.type === "content_block_start" && c.content_block?.type === "tool_use");
    expect(starts).toHaveLength(1);
    expect(starts[0].content_block.name).toBe("glob");
    // No nameless block was ever emitted
    expect(out.filter((c) => c.content_block?.name === "")).toHaveLength(0);
    const input = out.find((c) => c.delta?.type === "input_json_delta");
    expect(JSON.parse(input.delta.partial_json)).toEqual({ pattern: "*combo*" });
    expect(out.some((c) => c.type === "content_block_stop")).toBe(true);
  });

  it("resolves multi-tool by unambiguous args", () => {
    const state = unikeyState();
    const out = runAll(state, [
      idChunk("call_9"),
      argsChunk('{"filePath":"a.js"}'),
      finishChunk(),
    ]);
    const starts = out.filter((c) => c.type === "content_block_start" && c.content_block?.type === "tool_use");
    expect(starts).toHaveLength(1);
    expect(starts[0].content_block.name).toBe("read");
  });

  it("drops the block when the name is unresolvable (never emits name:\"\")", () => {
    const ambiguous = [
      { name: "a", parameters: { type: "object", properties: { q: { type: "string" } }, required: [] } },
      { name: "b", parameters: { type: "object", properties: { q: { type: "string" } }, required: [] } },
    ];
    const state = unikeyState(ambiguous);
    const out = runAll(state, [
      idChunk("call_x"),
      argsChunk('{"q":"hi"}'),
      finishChunk(),
    ]);
    expect(out.filter((c) => c.content_block?.type === "tool_use")).toHaveLength(0);
    expect(out.filter((c) => c.content_block?.name === "")).toHaveLength(0);
  });

  it("keeps legacy immediate start for named providers/models", () => {
    const s = initState(FORMATS.CLAUDE);
    s.provider = "openai";
    s.model = "gpt-5";
    s.functionTools = TOOLS;
    const out = runAll(s, [{
      id: "chatcmpl-y", model: "gpt-5",
      choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read", arguments: "" } }] } }],
    }]);
    const starts = out.filter((c) => c.type === "content_block_start");
    expect(starts).toHaveLength(1);
    expect(starts[0].content_block.name).toBe("read");
  });

  it("emits start when the name arrives in a later delta", () => {
    const state = unikeyState();
    const out = runAll(state, [
      idChunk("call_1"),
      { id: "chatcmpl-x", model: "gemini-3.5-flash",
        choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "glob" } }] } }] },
      finishChunk(),
    ]);
    const starts = out.filter((c) => c.type === "content_block_start" && c.content_block?.type === "tool_use");
    expect(starts).toHaveLength(1);
    expect(starts[0].content_block.name).toBe("glob");
  });
});

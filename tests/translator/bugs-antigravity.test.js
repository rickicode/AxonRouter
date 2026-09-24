// Real Antigravity-MITM requests (Gemini-internal: { request: { contents, ... } }) → OpenAI.
import { describe, it, expect } from "vitest";
import "./registerAll.js";
import { translateRequest, translateResponse, initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { openaiToAntigravityRequest } from "../../open-sse/translator/request/openai-to-gemini.js";
import { ANTIGRAVITY_DEFAULT_SYSTEM } from "../../open-sse/config/appConstants.js";

const AG2O = (req) =>
  translateRequest(FORMATS.ANTIGRAVITY, FORMATS.OPENAI, "m", { request: req }, true, null, null);

describe("Antigravity → OpenAI", () => {
  // antigravity-to-openai.js — content with BOTH functionResponse and functionCall/text
  // previously returned toolResults early → dropped tool calls / text (fixed in #2225)
  it("functionResponse + functionCall in same content keeps both", () => {
    const out = AG2O({
      contents: [{
        role: "model",
        parts: [
          { functionResponse: { id: "c1", name: "prev", response: { result: "done" } } },
          { functionCall: { id: "c2", name: "next", args: {} } },
        ],
      }],
    });
    const json = JSON.stringify(out);
    expect(json, "functionCall lost when sharing content with functionResponse").toContain("\"next\"");
  });

  // antigravity-to-openai.js:167 — functionCall without id gets a random Date.now() id
  // KNOWN BUG: unstable id breaks matching with its functionResponse
  it("functionCall without id keeps a stable matchable id", () => {
    const out = AG2O({
      contents: [
        { role: "model", parts: [{ functionCall: { name: "search", args: { q: "x" } } }] },
        { role: "user", parts: [{ functionResponse: { name: "search", response: { result: "r" } } }] },
      ],
    });
    const asst = out.messages.find((m) => m.tool_calls);
    const tool = out.messages.find((m) => m.role === "tool");
    expect(tool?.tool_call_id, "id mismatch between call and response").toBe(asst?.tool_calls?.[0]?.id);
  });

  // antigravity-to-openai.js:144-147 — signature-only part handling (regression guard)
  it("signature-only part does not produce empty text", () => {
    const out = AG2O({
      contents: [{ role: "model", parts: [{ thoughtSignature: "sig", text: "" }] }],
    });
    const asst = out.messages.find((m) => m.role === "assistant");
    const content = asst?.content;
    const hasEmpty = Array.isArray(content)
      ? content.some((c) => c.type === "text" && c.text === "")
      : content === "";
    expect(hasEmpty, "empty text part emitted").toBe(false);
  });
});

describe("Antigravity → Claude", () => {
  it("tool call input_json_delta includes Anthropic index", () => {
    const state = initState(FORMATS.CLAUDE);
    const events = translateResponse(FORMATS.ANTIGRAVITY, FORMATS.CLAUDE, {
      response: {
        responseId: "resp-1",
        modelVersion: "gemini-pro-agent",
        candidates: [{
          content: {
            role: "model",
            parts: [{ functionCall: { name: "bash", args: { command: "git status" } } }],
          },
          finishReason: "STOP",
          index: 0,
        }],
      },
    }, state);

    const jsonDelta = events.find(
      (event) => event.type === "content_block_delta" && event.delta?.type === "input_json_delta"
    );
    expect(jsonDelta).toMatchObject({ index: expect.any(Number) });
    expect(JSON.parse(jsonDelta.delta.partial_json)).toEqual({ command: "git status" });
  });
});

describe("Antigravity executor", () => {
  it("strips optional from nested tool schemas", () => {
    const out = new AntigravityExecutor().transformRequest("gemini-2.5-pro", {
      request: {
        contents: [{ role: "user", parts: [{ text: "hi" }] }],
        tools: [{
          functionDeclarations: [{
            name: "lookup",
            description: "Lookup a value",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query",
                  optional: true,
                },
              },
            },
          }],
        }],
      },
    }, true, { projectId: "project-1", connectionId: "conn-1" });

    const query = out.request.tools[0].functionDeclarations[0].parameters.properties.query;
    expect(query).toEqual({ type: "string", description: "Search query" });
  });

  it("does not inject the legacy Antigravity default system prompt for Gemini-backed models", () => {
    const out = openaiToAntigravityRequest("gemini-3.5-flash-low", {
      messages: [
        { role: "system", content: "USER_SYSTEM_PROMPT" },
        { role: "user", content: "hello" },
      ],
    }, true, { projectId: "project-1", connectionId: "conn-1" });

    const system = JSON.stringify(out.request.systemInstruction);
    expect(system).toContain("USER_SYSTEM_PROMPT");
    expect(system).not.toContain(ANTIGRAVITY_DEFAULT_SYSTEM);
    expect(system).not.toContain("Please ignore the following [ignore]");
  });

  it("does not inject the legacy Antigravity default system prompt for Claude-backed models", () => {
    const out = openaiToAntigravityRequest("claude-opus-4-6-thinking", {
      messages: [
        { role: "system", content: "USER_SYSTEM_PROMPT" },
        { role: "user", content: "hello" },
      ],
    }, true, { projectId: "project-1", connectionId: "conn-1" });

    const system = JSON.stringify(out.request.systemInstruction);
    expect(system).toContain("USER_SYSTEM_PROMPT");
    expect(system).not.toContain(ANTIGRAVITY_DEFAULT_SYSTEM);
    expect(system).not.toContain("Please ignore the following [ignore]");
  });

  it("ensures conversation begins with user turn even if history starts with assistant tool call", () => {
    const out = openaiToAntigravityRequest("gemini-3.8-flash-high", {
      messages: [
        { role: "assistant", tool_calls: [{ id: "call_1", type: "function", function: { name: "patch", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "call_1", content: "done" },
        { role: "user", content: "test" },
      ],
    }, true, { projectId: "project-1", connectionId: "conn-1" });

    const exec = new AntigravityExecutor();
    const transformed = exec.transformRequest("gemini-3.8-flash-high", out, true, { projectId: "project-1", connectionId: "conn-1" });
    const contents = transformed.request.contents;
    expect(contents[0].role).toBe("user");
    expect(contents[1].role).toBe("model");
    expect(contents[1].parts[0].functionCall.name).toBe("patch");
    expect(contents[2].role).toBe("user");
  });

  it("ensures orphaned tool calls without responses receive mock functionResponse", () => {
    const out = openaiToAntigravityRequest("gemini-3.8-flash-high", {
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", tool_calls: [{ id: "call_2", type: "function", function: { name: "terminal", arguments: "{}" } }] },
        { role: "user", content: "cancel that, do this instead" },
      ],
    }, true, { projectId: "project-1", connectionId: "conn-1" });

    const exec = new AntigravityExecutor();
    const transformed = exec.transformRequest("gemini-3.8-flash-high", out, true, { projectId: "project-1", connectionId: "conn-1" });
    const contents = transformed.request.contents;
    expect(contents[0].role).toBe("user");
    expect(contents[1].role).toBe("model");
    expect(contents[1].parts[0].functionCall.name).toBe("terminal");
    expect(contents[2].role).toBe("user");
    const hasResp = contents[2].parts.some(p => p.functionResponse && p.functionResponse.name === "terminal");
    expect(hasResp).toBe(true);
  });

  it("ensures parallel tool calls with missing responses are sanitized without crashing Gemini", () => {
    const out = openaiToAntigravityRequest("claude-sonnet-4-6", {
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          tool_calls: [
            { id: "call_a", type: "function", function: { name: "read_file", arguments: "{}" } },
            { id: "call_b", type: "function", function: { name: "terminal", arguments: "{}" } },
          ]
        },
        { role: "tool", tool_call_id: "call_a", content: "file content" },
        // call_b is missing response, followed by another assistant turn!
        {
          role: "assistant",
          tool_calls: [
            { id: "call_c", type: "function", function: { name: "search_files", arguments: "{}" } }
          ]
        },
        { role: "tool", tool_call_id: "call_c", content: "search result" },
      ],
    }, true, { projectId: "project-1", connectionId: "conn-1" });

    const exec = new AntigravityExecutor();
    const transformed = exec.transformRequest("claude-sonnet-4-6", out, true, { projectId: "project-1", connectionId: "conn-1" });
    const contents = transformed.request.contents;

    // Verify all model functionCalls are followed immediately by user functionResponses
    for (let i = 0; i < contents.length; i++) {
      const c = contents[i];
      if (c.role === "model" && c.parts.some(p => p.functionCall)) {
        const next = contents[i + 1];
        expect(next).toBeDefined();
        expect(next.role).toBe("user");
        const callNames = c.parts.filter(p => p.functionCall).map(p => p.functionCall.name);
        const respNames = next.parts.filter(p => p.functionResponse).map(p => p.functionResponse.name);
        for (const name of callNames) {
          expect(respNames).toContain(name);
        }
      }
    }
  });
});

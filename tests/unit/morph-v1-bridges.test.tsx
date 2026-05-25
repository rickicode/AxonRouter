import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfiguredMorphSettings = vi.fn();
const dispatchMorphCapability = vi.fn();
const isMorphFastModel = vi.fn();
const resolveMorphInstructionsForRequest = vi.fn();
const buildMorphRepoContext = vi.fn();
const resolveMorphAutoModel = vi.fn();
const applyMorphAutoResolution = vi.fn();
const shouldPreflightRejectMorphContext = vi.fn();
const createMorphContextLengthPreflightResponse = vi.fn();
const maybeCompactCleanApplyPayload = vi.fn();
const maybeBuildMorphFastApplyPayload = vi.fn();

vi.mock("../../src/app/api/morph/_shared.ts", () => ({
  getConfiguredMorphSettings,
}));

vi.mock("../../src/app/api/morph/_dispatch.ts", () => ({
  dispatchMorphCapability,
}));

vi.mock("../../src/shared/constants/models", () => ({
  isMorphFastModel,
}));

vi.mock("../../open-sse/config/morphInstructionsResolver.ts", () => ({
  resolveMorphInstructionsForRequest,
}));

vi.mock("../../src/lib/morph/repoContext.ts", () => ({
  buildMorphRepoContext,
}));

vi.mock("../../src/lib/morph/autoRouting.ts", () => ({
  resolveMorphAutoModel,
  applyMorphAutoResolution,
  shouldPreflightRejectMorphContext,
  createMorphContextLengthPreflightResponse,
}));

vi.mock("../../src/lib/morph/compact.ts", () => ({
  maybeCompactCleanApplyPayload,
}));

vi.mock("../../src/lib/morph/fastApplyIntercept.tsx", () => ({
  maybeBuildMorphFastApplyPayload,
}));

describe("Morph v1 bridges", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getConfiguredMorphSettings.mockResolvedValue({
      baseUrl: "https://api.morphllm.com",
      apiKeys: [{ email: "a@example.com", key: "secret" }],
    });
    isMorphFastModel.mockReturnValue(true);
    resolveMorphInstructionsForRequest.mockResolvedValue("Morph default instructions");
    buildMorphRepoContext.mockReturnValue({
      workingDir: "/workspaces/axonrouter",
      date: "2026-05-07",
      environment: "linux-x64, Node.js v24.0.0",
      structure: ["src", "open-sse"],
      isGitRepo: true,
      currentBranch: "main",
      mainBranch: "main",
      gitStatus: "M 0, D 0, ?? 0",
      recentCommits: ["abc123 initial"],
    });
    resolveMorphAutoModel.mockImplementation(async ({ payload }) => ({
      requestedModel: typeof payload?.model === "string" ? payload.model.replace(/^morph\//, "") : "qwen",
      resolvedModel: typeof payload?.model === "string" ? payload.model.replace(/^morph\//, "") : "qwen",
      routeSource: "explicit",
      reason: "explicit_model",
      fallbackUsed: false,
    }));
    shouldPreflightRejectMorphContext.mockReturnValue(false);
    createMorphContextLengthPreflightResponse.mockImplementation(() => Response.json({ error: { code: "context_length_exceeded" } }, { status: 400 }));
    maybeCompactCleanApplyPayload.mockImplementation(async (payload) => payload);
    maybeBuildMorphFastApplyPayload.mockResolvedValue({ intercept: false });
    applyMorphAutoResolution.mockImplementation((payload, resolution) => ({
      ...payload,
      model: resolution?.resolvedModel || payload?.model,
      ...(resolution ? { morphRoute: resolution } : {}),
    }));
  });

  it("injects repo context and forwards tools for /v1/messages", async () => {
    const { maybeDispatchMorphMessagesRequest } = await import("../../src/app/api/v1/_morphMessages.ts");

    dispatchMorphCapability.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "chatcmpl_1",
      model: "qwen",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    }), {
      headers: { "Content-Type": "application/json" },
    }));

    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/qwen",
        max_tokens: 128,
        messages: [
          { role: "user", content: [{ type: "text", text: "hello" }] },
          { role: "assistant", content: [{ type: "tool_use", id: "call_1", name: "read_file", input: { path: "a.js" } }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: [{ type: "text", text: "file body" }] }] },
        ],
        tools: [{ name: "read_file", description: "Read", input_schema: { type: "object", properties: { path: { type: "string" } } } }],
        tool_choice: { type: "tool", name: "read_file" },
        parallel_tool_calls: true,
      }),
    });

    const response = await maybeDispatchMorphMessagesRequest(request);
    expect(response.status).toBe(200);

    const dispatched = dispatchMorphCapability.mock.calls[0][0].requestPayload;
    expect(dispatched.morphContext.repo.workingDir).toBe("/workspaces/axonrouter");
    expect(dispatched.messages[0]).toEqual({ role: "system", content: expect.stringContaining("Morph default instructions") });
    expect(dispatched.tools[0].function.name).toBe("read_file");
    expect(dispatched.tool_choice).toEqual({ type: "tool", name: "read_file" });
    expect(dispatched.parallel_tool_calls).toBe(true);
    expect(dispatched.messages.some((msg) => msg.role === "tool" && msg.tool_call_id === "call_1")).toBe(true);
  });

  it("sanitizes invalid OpenAI tool names for /v1/messages", async () => {
    const { maybeDispatchMorphMessagesRequest } = await import("../../src/app/api/v1/_morphMessages.ts");

    dispatchMorphCapability.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "chatcmpl_1b",
      model: "qwen",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    }), {
      headers: { "Content-Type": "application/json" },
    }));

    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/qwen",
        max_tokens: 128,
        messages: [
          { role: "user", content: [{ type: "text", text: "hello" }] },
          { role: "assistant", content: [{ type: "tool_use", id: "call_1", name: "functions.read", input: { path: "a.js" } }] },
        ],
        tools: [{ name: "functions.read", description: "Read", input_schema: { type: "object", properties: { path: { type: "string" } } } }],
        tool_choice: { type: "tool", name: "functions.read" },
      }),
    });

    const response = await maybeDispatchMorphMessagesRequest(request);
    expect(response.status).toBe(200);

    const dispatched = dispatchMorphCapability.mock.calls.at(-1)[0].requestPayload;
    expect(dispatched.tools[0].function.name).toBe("functions_read");
    expect(dispatched.tool_choice).toEqual({ type: "tool", name: "functions_read" });
    expect(dispatched.messages.some((msg) => msg.tool_calls?.[0]?.function?.name === "functions_read")).toBe(true);
  });

  it("injects repo context and forwards tools for /v1/responses", async () => {
    const { maybeDispatchMorphResponsesRequest } = await import("../../src/app/api/v1/_morphResponses.ts");

    dispatchMorphCapability.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "chatcmpl_2",
      model: "qwen",
      choices: [{ index: 0, message: { role: "assistant", content: "done" }, finish_reason: "stop" }],
    }), {
      headers: { "Content-Type": "application/json" },
    }));

    const request = new Request("http://localhost/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/qwen",
        input: [
          { role: "user", content: [{ type: "input_text", text: "hello" }] },
          { role: "assistant", content: [{ type: "function_call", call_id: "call_2", name: "grep", arguments: "{\"q\":\"x\"}" }] },
          { type: "function_call_output", call_id: "call_2", output: "result" },
        ],
        tools: [{ type: "function", name: "grep", description: "Search", parameters: { type: "object", properties: { q: { type: "string" } } } }],
        tool_choice: "auto",
        parallel_tool_calls: true,
      }),
    });

    const response = await maybeDispatchMorphResponsesRequest(request);
    expect(response.status).toBe(200);

    const dispatched = dispatchMorphCapability.mock.calls[0][0].requestPayload;
    expect(dispatched.morphContext.repo.currentBranch).toBe("main");
    expect(dispatched.messages[0]).toEqual({ role: "system", content: expect.stringContaining("Morph default instructions") });
    expect(dispatched.tools[0].function.name).toBe("grep");
    expect(dispatched.tool_choice).toBe("auto");
    expect(dispatched.parallel_tool_calls).toBe(true);
    expect(dispatched.messages.some((msg) => msg.role === "tool" && msg.tool_call_id === "call_2")).toBe(true);
  });

  it("sanitizes invalid OpenAI tool names for /v1/responses", async () => {
    const { maybeDispatchMorphResponsesRequest } = await import("../../src/app/api/v1/_morphResponses.ts");

    dispatchMorphCapability.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "chatcmpl_2b",
      model: "qwen",
      choices: [{ index: 0, message: { role: "assistant", content: "done" }, finish_reason: "stop" }],
    }), {
      headers: { "Content-Type": "application/json" },
    }));

    const request = new Request("http://localhost/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/qwen",
        input: [
          { role: "user", content: [{ type: "input_text", text: "hello" }] },
          { role: "assistant", content: [{ type: "function_call", call_id: "call_2", name: "functions.read", arguments: "{\"path\":\"x\"}" }] },
        ],
        tools: [{ type: "function", name: "functions.read", description: "Read", parameters: { type: "object", properties: { path: { type: "string" } } } }],
        tool_choice: { type: "function", function: { name: "functions.read" } },
      }),
    });

    const response = await maybeDispatchMorphResponsesRequest(request);
    expect(response.status).toBe(200);

    const dispatched = dispatchMorphCapability.mock.calls.at(-1)[0].requestPayload;
    expect(dispatched.tools[0].function.name).toBe("functions_read");
    expect(dispatched.tool_choice).toEqual({ type: "function", function: { name: "functions_read" } });
    expect(dispatched.messages.some((msg) => msg.tool_calls?.[0]?.function?.name === "functions_read")).toBe(true);
  });

  it("resolves Morph auto aliases for /v1/messages before dispatch", async () => {
    const { maybeDispatchMorphMessagesRequest } = await import("../../src/app/api/v1/_morphMessages.ts");

    resolveMorphAutoModel.mockResolvedValueOnce({
      requestedModel: "auto-manual",
      resolvedModel: "morph-qwen36-27b",
      routeSource: "manual",
      reason: "short_prompt,no_tools",
      fallbackUsed: false,
    });
    applyMorphAutoResolution.mockImplementationOnce((payload, resolution) => ({
      ...payload,
      model: resolution.resolvedModel,
      morphRoute: resolution,
    }));

    dispatchMorphCapability.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "chatcmpl_auto_messages",
      model: "morph-qwen36-27b",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    }), {
      headers: { "Content-Type": "application/json" },
    }));

    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/auto-manual",
        max_tokens: 64,
        messages: [{ role: "user", content: [{ type: "text", text: "reply with ok" }] }],
      }),
    });

    const response = await maybeDispatchMorphMessagesRequest(request);
    expect(response.status).toBe(200);

    const dispatched = dispatchMorphCapability.mock.calls.at(-1)[0].requestPayload;
    expect(dispatched.model).toBe("morph-qwen36-27b");
    expect(dispatched.morphRoute).toMatchObject({
      requestedModel: "auto-manual",
      resolvedModel: "morph-qwen36-27b",
      routeSource: "manual",
    });
  });

  it("resolves Morph auto aliases for /v1/responses before dispatch", async () => {
    const { maybeDispatchMorphResponsesRequest } = await import("../../src/app/api/v1/_morphResponses.ts");

    resolveMorphAutoModel.mockResolvedValueOnce({
      requestedModel: "auto-manual",
      resolvedModel: "morph-qwen36-27b",
      routeSource: "manual",
      reason: "short_prompt,no_tools",
      fallbackUsed: false,
    });
    applyMorphAutoResolution.mockImplementationOnce((payload, resolution) => ({
      ...payload,
      model: resolution.resolvedModel,
      morphRoute: resolution,
    }));

    dispatchMorphCapability.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "chatcmpl_auto_responses",
      model: "morph-qwen36-27b",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    }), {
      headers: { "Content-Type": "application/json" },
    }));

    const request = new Request("http://localhost/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/auto-manual",
        input: [{ role: "user", content: [{ type: "input_text", text: "reply with ok" }] }],
      }),
    });

    const response = await maybeDispatchMorphResponsesRequest(request);
    expect(response.status).toBe(200);

    const dispatched = dispatchMorphCapability.mock.calls.at(-1)[0].requestPayload;
    expect(dispatched.model).toBe("morph-qwen36-27b");
    expect(dispatched.morphRoute).toMatchObject({
      requestedModel: "auto-manual",
      resolvedModel: "morph-qwen36-27b",
      routeSource: "manual",
    });
  });

  it("returns a preflight context-length error for impossible /v1/messages requests", async () => {
    const { maybeDispatchMorphMessagesRequest } = await import("../../src/app/api/v1/_morphMessages.ts");

    resolveMorphAutoModel.mockResolvedValueOnce({
      requestedModel: "auto-manual",
      resolvedModel: "morph-qwen35-397b",
      routeSource: "context-aware",
      reason: "context_fallback_max",
      fallbackUsed: false,
      estimatedTokens: 205850,
      requiredContext: 242177,
      selectedContextWindow: 196608,
      selectedContextMeta: {
        contextWindow: 196608,
        documentedContextWindow: 262000,
        verifiedRuntimeContextWindow: 196608,
        contextWindowSource: "runtime-verified",
      },
    });
    shouldPreflightRejectMorphContext.mockReturnValueOnce(true);
    createMorphContextLengthPreflightResponse.mockImplementationOnce(() => Response.json({
      error: {
        code: "context_length_exceeded",
        type: "invalid_request_error",
      },
    }, { status: 400 }));

    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/auto-manual",
        max_tokens: 16384,
        messages: [{ role: "user", content: [{ type: "text", text: "x".repeat(600000) }] }],
      }),
    });

    const response = await maybeDispatchMorphMessagesRequest(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "context_length_exceeded",
        type: "invalid_request_error",
      },
    });
    expect(dispatchMorphCapability).not.toHaveBeenCalled();
  });

  it("runs Morph compact before dispatch when clean apply payloads are eligible", async () => {
    const { maybeDispatchMorphMessagesRequest } = await import("../../src/app/api/v1/_morphMessages.ts");

    maybeCompactCleanApplyPayload.mockImplementationOnce(async (payload) => ({
      ...payload,
      morphContext: {
        ...payload.morphContext,
        compactedForCleanApply: true,
        compactSavedMessages: 3,
      },
      messages: [{ role: "system", content: "compacted" }, { role: "user", content: "final" }],
    }));

    dispatchMorphCapability.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "chatcmpl_compacted",
      model: "morph-qwen35-397b",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    }), {
      headers: { "Content-Type": "application/json" },
    }));

    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/morph-qwen35-397b",
        max_tokens: 64,
        messages: [{ role: "user", content: [{ type: "text", text: "rewrite this generated file" }] }],
      }),
    });

    const response = await maybeDispatchMorphMessagesRequest(request);
    expect(response.status).toBe(200);
    expect(maybeCompactCleanApplyPayload).toHaveBeenCalledTimes(1);
    expect(dispatchMorphCapability).toHaveBeenCalledWith(expect.objectContaining({
      requestPayload: expect.objectContaining({
        morphContext: expect.objectContaining({
          compactedForCleanApply: true,
          compactSavedMessages: 3,
        }),
        messages: [
          { role: "system", content: "compacted" },
          { role: "user", content: "final" },
        ],
      }),
    }));
  });

  it("routes eligible edit calls through internal Morph fast apply instead of compact", async () => {
    const { maybeDispatchMorphMessagesRequest } = await import("../../src/app/api/v1/_morphMessages.ts");

    maybeBuildMorphFastApplyPayload.mockResolvedValueOnce({
      intercept: true,
      requestPayload: {
        model: "morph-v3-fast",
        stream: false,
        messages: [{ role: "user", content: "<instruction>x</instruction>\n<code>a</code>\n<update>b</update>" }],
        morphContext: {
          internalFastApplyIntercepted: true,
          internalFastApplyTargetPath: "src/example.js",
          internalFastApplyModel: "morph-v3-fast",
        },
      },
    });

    dispatchMorphCapability.mockResolvedValueOnce(new Response(JSON.stringify({
      id: "chatcmpl_fast_apply",
      model: "morph-v3-fast",
      choices: [{ index: 0, message: { role: "assistant", content: "merged" }, finish_reason: "stop" }],
    }), {
      headers: { "Content-Type": "application/json" },
    }));

    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/morph-qwen35-397b",
        messages: [{ role: "user", content: [{ type: "text", text: "edit the file" }] }],
      }),
    });

    const response = await maybeDispatchMorphMessagesRequest(request);
    expect(response.status).toBe(200);
    expect(maybeCompactCleanApplyPayload).not.toHaveBeenCalled();
    expect(dispatchMorphCapability).toHaveBeenCalledWith(expect.objectContaining({
      requestLabel: "morph:v1-messages:fast-apply",
      requestPayload: expect.objectContaining({
        model: "morph-v3-fast",
        morphContext: expect.objectContaining({
          internalFastApplyIntercepted: true,
          internalFastApplyTargetPath: "src/example.js",
          internalFastApplyModel: "morph-v3-fast",
        }),
      }),
    }));
  });

  it("bridges Morph streaming chat chunks to Claude SSE", async () => {
    const { maybeDispatchMorphMessagesRequest } = await import("../../src/app/api/v1/_morphMessages.ts");

    const upstreamSse = [
      'data: {"id":"chatcmpl_3","model":"qwen","choices":[{"index":0,"delta":{"content":"hi"}}]}\n\n',
      'data: {"id":"chatcmpl_3","model":"qwen","choices":[{"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\n',
      'data: [DONE]\n\n',
    ].join("");

    dispatchMorphCapability.mockResolvedValueOnce(new Response(upstreamSse, {
      headers: { "Content-Type": "text/event-stream" },
    }));

    const request = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/qwen",
        stream: true,
        messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      }),
    });

    const response = await maybeDispatchMorphMessagesRequest(request);
    const text = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: message_start");
    expect(text).toContain("event: content_block_delta");
    expect(text).toContain("\"text\":\"hi\"");
    expect(text).toContain("event: message_stop");
  });

  it("bridges Morph streaming chat chunks to Responses SSE", async () => {
    const { maybeDispatchMorphResponsesRequest } = await import("../../src/app/api/v1/_morphResponses.ts");

    const upstreamSse = [
      'data: {"id":"chatcmpl_4","model":"qwen","choices":[{"index":0,"delta":{"content":"<think>reason"}}]}\n\n',
      'data: {"id":"chatcmpl_4","model":"qwen","choices":[{"index":0,"delta":{"content":"ing</think>hello"}}]}\n\n',
      'data: {"id":"chatcmpl_4","model":"qwen","choices":[{"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ].join("");

    dispatchMorphCapability.mockResolvedValueOnce(new Response(upstreamSse, {
      headers: { "Content-Type": "text/event-stream" },
    }));

    const request = new Request("http://localhost/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/qwen",
        stream: true,
        input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
      }),
    });

    const response = await maybeDispatchMorphResponsesRequest(request);
    const text = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("response.reasoning.delta");
    expect(text).toContain("\"delta\":\"reason\"");
    expect(text).toContain("response.output_text.delta");
    expect(text).toContain("\"delta\":\"hello\"");
    expect(text).not.toContain("<think>");
    expect(text).not.toContain("</think>");
    expect(text).toContain("response.completed");
    expect(text).toContain("[DONE]");
  });

  it("coalesces streamed Morph tool-call argument chunks for Responses SSE", async () => {
    const { maybeDispatchMorphResponsesRequest } = await import("../../src/app/api/v1/_morphResponses.ts");

    const upstreamSse = [
      'data: {"id":"chatcmpl_5","model":"qwen","choices":[{"index":0,"delta":{"tool_calls":[{"id":"call_1","index":0,"type":"function","function":{"name":"get_weather","arguments":""}}]}}]}\n\n',
      'data: {"id":"chatcmpl_5","model":"qwen","choices":[{"index":0,"delta":{"tool_calls":[{"id":null,"index":0,"type":"function","function":{"name":null,"arguments":"{\\\"city\\\": \\\"San"}}]}}]}\n\n',
      'data: {"id":"chatcmpl_5","model":"qwen","choices":[{"index":0,"delta":{"tool_calls":[{"id":null,"index":0,"type":"function","function":{"name":null,"arguments":" Francisco\\\"}"}}]}}]}\n\n',
      'data: {"id":"chatcmpl_5","model":"qwen","choices":[{"index":0,"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ].join("");

    dispatchMorphCapability.mockResolvedValueOnce(new Response(upstreamSse, {
      headers: { "Content-Type": "text/event-stream" },
    }));

    const request = new Request("http://localhost/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "morph/qwen",
        stream: true,
        input: [{ role: "user", content: [{ type: "input_text", text: "weather" }] }],
        tools: [{ type: "function", name: "get_weather", parameters: { type: "object", properties: {} } }],
      }),
    });

    const response = await maybeDispatchMorphResponsesRequest(request);
    const text = await response.text();
    const toolEvents = text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6))
      .filter((line) => line && line !== "[DONE]")
      .map((line) => JSON.parse(line))
      .filter((event) => event.type === "response.function_call_arguments.done");

    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]).toMatchObject({
      call_id: "call_1",
      name: "get_weather",
      arguments: '{"city": "San Francisco"}',
    });
    expect(text).toContain("response.completed");
    expect(text).toContain("[DONE]");
  });
});

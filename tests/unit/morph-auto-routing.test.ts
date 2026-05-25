import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyMorphAutoResolution,
  buildMorphContextLengthErrorPayload,
  estimateMorphTokenCount,
  resolveMorphAutoModel,
  shouldPreflightRejectMorphContext,
} from "../../src/lib/morph/autoRouting.ts";

describe("Morph auto routing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("routes simple short chat prompts to minimax in manual mode", async () => {
    const result = await resolveMorphAutoModel({
      payload: {
        model: "morph/auto-manual",
        messages: [{ role: "user", content: "reply with ok" }],
        max_tokens: 16,
      },
      morphSettings: null,
      context: { endpoint: "chat" },
    });

    expect(result).toMatchObject({
      requestedModel: "auto-manual",
      resolvedModel: "morph-minimax27-230b",
      routeSource: "manual",
      selectedContextWindow: 196608,
      selectedContextMeta: {
        contextWindow: 196608,
        documentedContextWindow: 200000,
        verifiedRuntimeContextWindow: 196608,
        contextWindowSource: "runtime-verified",
      },
    });
  });

  it("routes complex prompts to qwen35 in manual mode", async () => {
    const result = await resolveMorphAutoModel({
      payload: {
        model: "morph/auto-manual",
        tools: [{ type: "function", function: { name: "read_file" } }],
        messages: [{ role: "user", content: "review this architecture and explain the tradeoffs in detail" }],
      },
      morphSettings: null,
    });

    expect(result).toMatchObject({
      requestedModel: "auto-manual",
      resolvedModel: "morph-qwen35-397b",
      routeSource: "manual",
    });
  });

  it("falls back from Morph router mode to manual routing on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("router unavailable");
    }));

    const result = await resolveMorphAutoModel({
      payload: {
        model: "morph/auto",
        messages: [{ role: "user", content: "reply with ok" }],
        max_tokens: 16,
      },
      morphSettings: {
        apiKeys: [{ key: "mk-test", status: "active", isExhausted: false }],
      },
      context: { endpoint: "chat" },
    });

    expect(result).toMatchObject({
      requestedModel: "auto",
      resolvedModel: "morph-minimax27-230b",
      routeSource: "router-fallback-manual",
      fallbackUsed: true,
    });
    expect(result.reason).toContain("router_error=");
  });

  it("uses Morph key ordering for router requests", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ difficulty: "easy" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await resolveMorphAutoModel({
      payload: {
        model: "morph/auto",
        messages: [{ role: "user", content: "reply with ok" }],
      },
      morphSettings: {
        roundRobinEnabled: true,
        apiKeys: [
          { key: "first-key", status: "active", isExhausted: false, email: "a@example.com" },
          { key: "second-key", status: "active", isExhausted: false, email: "b@example.com" },
        ],
      },
    });

    const [, options] = fetchSpy.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer first-key");
  });

  it("preserves explicit concrete Morph models", async () => {
    const result = await resolveMorphAutoModel({
      payload: {
        model: "morph/morph-minimax27-230b",
        messages: [{ role: "user", content: "hello" }],
      },
      morphSettings: null,
    });

    expect(result).toMatchObject({
      requestedModel: "morph-minimax27-230b",
      resolvedModel: "morph-minimax27-230b",
      routeSource: "explicit",
    });
  });

  it("keeps qwen36 as the simple target for non-chat endpoints", async () => {
    const result = await resolveMorphAutoModel({
      payload: {
        model: "morph/auto-manual",
        messages: [{ role: "user", content: "reply with ok" }],
        max_tokens: 16,
      },
      morphSettings: null,
      context: { endpoint: "messages" },
    });

    expect(result).toMatchObject({
      requestedModel: "auto-manual",
      resolvedModel: "morph-qwen36-27b",
      routeSource: "manual",
    });
  });

  it("applies resolved Morph auto model metadata to the payload", () => {
    const routed = applyMorphAutoResolution(
      { model: "morph/auto-manual", messages: [{ role: "user", content: "reply with ok" }] },
      {
        requestedModel: "auto-manual",
        resolvedModel: "morph-minimax27-230b",
        routeSource: "manual",
        reason: "short_prompt,no_tools,max_tokens_small,chat_safe_model",
        estimatedTokens: 20,
        estimatedContext: 24,
        requiredContext: 24,
        selectedContextWindow: 196608,
        selectedContextMeta: {
          contextWindow: 196608,
          documentedContextWindow: 200000,
          verifiedRuntimeContextWindow: 196608,
          contextWindowSource: "runtime-verified",
        },
      }
    );

    expect(routed).toMatchObject({
      model: "morph-minimax27-230b",
      morphRoute: {
        requestedModel: "auto-manual",
        resolvedModel: "morph-minimax27-230b",
        routeSource: "manual",
        reason: "short_prompt,no_tools,max_tokens_small,chat_safe_model",
        estimatedTokens: 20,
        estimatedContext: 24,
        requiredContext: 24,
        selectedContextWindow: 196608,
        selectedContextMeta: {
          contextWindow: 196608,
          documentedContextWindow: 200000,
          verifiedRuntimeContextWindow: 196608,
          contextWindowSource: "runtime-verified",
        },
      },
    });
  });

  it("upgrades large requests using runtime-verified context windows", async () => {
    const result = await resolveMorphAutoModel({
      payload: {
        model: "morph/auto-manual",
        messages: [{ role: "user", content: "x".repeat(600000) }],
        max_tokens: 16384,
      },
      morphSettings: null,
      context: { endpoint: "chat" },
    });

    expect(result).toMatchObject({
      requestedModel: "auto-manual",
      resolvedModel: "morph-minimax27-230b",
      routeSource: "context-aware",
      selectedContextWindow: 196608,
      selectedContextMeta: {
        contextWindow: 196608,
        documentedContextWindow: 200000,
        verifiedRuntimeContextWindow: 196608,
        contextWindowSource: "runtime-verified",
      },
    });
    expect(result.reason).toContain("estimated_tokens=");
    expect(result.estimatedTokens).toBeGreaterThan(131072);
  });

  it("exports token estimation for Morph preflight checks", () => {
    expect(estimateMorphTokenCount({
      messages: [{ role: "user", content: "hello world" }],
      max_tokens: 64,
    })).toBeGreaterThan(64);
  });

  it("marks impossible Morph requests for preflight rejection", () => {
    expect(shouldPreflightRejectMorphContext({
      reason: "context_fallback_max",
      requiredContext: 250000,
      selectedContextWindow: 196608,
    })).toBe(true);
    expect(shouldPreflightRejectMorphContext({
      reason: "context_fit",
      requiredContext: 180000,
      selectedContextWindow: 196608,
    })).toBe(false);
  });

  it("builds a standardized Morph preflight context error payload", () => {
    expect(buildMorphContextLengthErrorPayload({
      model: "morph-qwen35-397b",
      estimatedTokens: 205850,
      requiredContext: 242177,
      selectedContextWindow: 196608,
      selectedContextMeta: {
        contextWindow: 196608,
        documentedContextWindow: 262000,
        verifiedRuntimeContextWindow: 196608,
        contextWindowSource: "runtime-verified",
      },
    })).toEqual({
      error: {
        message: "Requested token count exceeds the model's maximum context length of 196608 tokens. Estimated total request size is 242177 tokens after safety margin, based on roughly 205850 input/output tokens. Reduce the input messages or lower max_tokens before retrying morph-qwen35-397b.",
        type: "invalid_request_error",
        code: "context_length_exceeded",
        param: "messages",
        provider: "morph",
        status: 400,
        model: "morph-qwen35-397b",
        estimated_tokens: 205850,
        estimated_context_tokens: 242177,
        context_window: 196608,
        context_meta: {
          contextWindow: 196608,
          documentedContextWindow: 262000,
          verifiedRuntimeContextWindow: 196608,
          contextWindowSource: "runtime-verified",
        },
      },
    });
  });
});

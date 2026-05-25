import { beforeEach, describe, expect, it, vi } from "vitest";

const saveRequestUsageSpy = vi.fn(() => Promise.resolve());

vi.mock("../../open-sse/runtime/usagePersistence", () => ({
  appendRequestLog: vi.fn(),
  saveRequestDetail: vi.fn(),
  saveRequestUsage: saveRequestUsageSpy,
}));

vi.mock("../../open-sse/utils/stream", () => ({
  COLORS: {
    green: "",
    reset: "",
  },
}));

describe("saveUsageStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves rich usage fields when persisting usage", async () => {
    const { saveUsageStats } = await import("../../open-sse/handlers/chatCore/requestDetail");

    saveUsageStats({
      provider: "openai",
      model: "gpt-4.1",
      connectionId: "conn-1",
      endpoint: "/v1/chat/completions",
      tokens: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 200,
        cached_tokens: 25,
        cache_read_input_tokens: 15,
        cache_creation_input_tokens: 10,
        reasoning_tokens: 5,
        prompt_tokens_details: { cached_tokens: 25 },
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    });

    expect(saveRequestUsageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-4.1",
        connectionId: "conn-1",
        endpoint: "/v1/chat/completions",
        tokens: expect.objectContaining({
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 200,
          cached_tokens: 25,
          cache_read_input_tokens: 15,
          cache_creation_input_tokens: 10,
          reasoning_tokens: 5,
          prompt_tokens_details: { cached_tokens: 25 },
          completion_tokens_details: { reasoning_tokens: 5 },
        }),
      })
    );
  });

  it("normalizes Anthropic-style token aliases while preserving extras", async () => {
    const { saveUsageStats } = await import("../../open-sse/handlers/chatCore/requestDetail");

    saveUsageStats({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      connectionId: "conn-2",
      endpoint: "/v1/messages",
      tokens: {
        input_tokens: 120,
        output_tokens: 40,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 20,
        reasoning_tokens: 10,
      },
    });

    expect(saveRequestUsageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        connectionId: "conn-2",
        endpoint: "/v1/messages",
        tokens: expect.objectContaining({
          prompt_tokens: 120,
          completion_tokens: 40,
          cache_read_input_tokens: 80,
          cache_creation_input_tokens: 20,
          reasoning_tokens: 10,
        }),
      })
    );
  });

  it("persists extended usage even when prompt and completion tokens are zero", async () => {
    const { saveUsageStats } = await import("../../open-sse/handlers/chatCore/requestDetail");

    saveUsageStats({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      connectionId: "conn-2",
      endpoint: "/v1/messages",
      tokens: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 7424,
        total_tokens: 7424,
      },
    });

    expect(saveRequestUsageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        connectionId: "conn-2",
        endpoint: "/v1/messages",
        tokens: expect.objectContaining({
          prompt_tokens: 0,
          completion_tokens: 0,
          cache_read_input_tokens: 7424,
          total_tokens: 7424,
        }),
      })
    );
  });
});

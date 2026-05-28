import { beforeEach, describe, expect, it, vi } from "vitest";

const getModelAliases = vi.fn();
const getComboByName = vi.fn();
const getProviderNodes = vi.fn();
const resolveProviderId = vi.fn((id) => id);

vi.mock("@/lib/localDb", () => ({
  getModelAliases,
  getComboByName,
  getProviderNodes,
}));

vi.mock("@/shared/constants/providers", () => ({
  AI_PROVIDERS: {
    "volcengine-ark": { id: "volcengine-ark", alias: "ark" },
    commandcode: { id: "commandcode", alias: "ccmd" },
  },
  APIKEY_PROVIDERS: {
    openai: { id: "openai" },
    anthropic: { id: "anthropic" },
  },
  resolveProviderId,
}));

describe("src/sse/services/model.getModelInfo", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getModelAliases.mockResolvedValue({});
    getComboByName.mockResolvedValue(null);
    getProviderNodes.mockImplementation(async ({ type }) => {
      if (type === "openai-compatible") {
        return [{ id: "openai-compatible-local", prefix: "ark" }];
      }
      return [];
    });
  });

  it("prefers provider-node prefix matches over built-in alias resolution", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");

    const result = await getModelInfo("ark/my-custom-model");

    expect(result).toEqual({ provider: "openai-compatible-local", model: "my-custom-model" });
  });

  it("falls back to built-in provider alias when no provider-node prefix matches", async () => {
    getProviderNodes.mockResolvedValue([]);
    const { getModelInfo } = await import("../../src/sse/services/model.ts");

    const result = await getModelInfo("ark/kimi-k2.6");

    expect(result).toEqual({ provider: "volcengine-ark", model: "kimi-k2.6" });
  });

  it("accepts full openai-compatible provider id without falling back to commandcode", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");

    const result = await getModelInfo("openai-compatible-chat-123/zai-org/GLM-4.7");

    expect(result).toEqual({
      provider: "openai-compatible-chat-123",
      model: "zai-org/GLM-4.7",
    });
  });

  it("accepts full anthropic-compatible provider id without falling back to commandcode", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");

    const result = await getModelInfo("anthropic-compatible-chat-123/claude-3-7-sonnet");

    expect(result).toEqual({
      provider: "anthropic-compatible-chat-123",
      model: "claude-3-7-sonnet",
    });
  });
});

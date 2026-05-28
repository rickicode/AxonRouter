import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock localDb before importing the module under test
const getProviderNodes = vi.fn().mockResolvedValue([]);
const getModelAliases = vi.fn().mockResolvedValue({});
const getComboByName = vi.fn().mockResolvedValue(null);
const resolveComboForModel = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/localDb", () => ({
  getProviderNodes,
  getModelAliases,
  getComboByName,
  resolveComboForModel,
  getSettings: vi.fn().mockResolvedValue({}),
  getApiKeys: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/routing/virtualModelResolver", () => ({
  isVirtualSystemModel: vi.fn(() => false),
  getVirtualSystemModelDefinition: vi.fn(() => null),
}));

describe("antigravity model routing - alias resolution", () => {
  beforeEach(() => {
    getProviderNodes.mockResolvedValue([]);
    getModelAliases.mockResolvedValue({});
    getComboByName.mockResolvedValue(null);
    resolveComboForModel.mockResolvedValue(null);
  });

  it("resolves model with known provider prefix (antigravity/gemini-2.5-flash)", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");
    const result = await getModelInfo("antigravity/gemini-2.5-flash");
    expect(result).toEqual({ provider: "antigravity", model: "gemini-2.5-flash" });
  });

  it("resolves model with known alias prefix (ag/gemini-2.5-flash) to antigravity", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");
    const result = await getModelInfo("ag/gemini-2.5-flash");
    expect(result).toEqual({ provider: "antigravity", model: "gemini-2.5-flash" });
  });

  it("resolves model with known API key provider prefix (openai/gpt-4)", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");
    const result = await getModelInfo("openai/gpt-4");
    expect(result).toEqual({ provider: "openai", model: "gpt-4" });
  });

  it("resolves model with kimi provider prefix correctly", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");
    const result = await getModelInfo("kimi/moonshot-v1-8k");
    expect(result).toEqual({ provider: "kimi", model: "moonshot-v1-8k" });
  });

  it("resolves model with claude alias prefix (cc/claude-4-sonnet) to claude", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");
    const result = await getModelInfo("cc/claude-4-sonnet");
    expect(result).toEqual({ provider: "claude", model: "claude-4-sonnet" });
  });

  it("falls back to commandcode for unknown prefix (randomvendor/some-model)", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");
    const result = await getModelInfo("randomvendor/some-model");
    expect(result).toEqual({
      provider: "commandcode",
      model: "randomvendor/some-model",
      isCommandCode: true,
    });
  });

  it("falls back to commandcode for truly unrecognized prefix", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");
    const result = await getModelInfo("unknownprefix/model-xyz");
    expect(result).toEqual({
      provider: "commandcode",
      model: "unknownprefix/model-xyz",
      isCommandCode: true,
    });
  });

  it("resolves deepseek alias (ds/deepseek-chat) to deepseek provider", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");
    const result = await getModelInfo("ds/deepseek-chat");
    expect(result).toEqual({ provider: "deepseek", model: "deepseek-chat" });
  });

  it("resolves volcengine-ark alias (ark/model) to volcengine-ark provider", async () => {
    const { getModelInfo } = await import("../../src/sse/services/model.ts");
    const result = await getModelInfo("ark/model-name");
    expect(result).toEqual({ provider: "volcengine-ark", model: "model-name" });
  });

  it("prioritizes custom provider nodes over alias resolution", async () => {
    getProviderNodes.mockResolvedValue([
      { id: "openai-compatible-custom", prefix: "mycustom" },
    ]);
    const { getModelInfo } = await import("../../src/sse/services/model.ts");
    const result = await getModelInfo("mycustom/my-model");
    expect(result).toEqual({ provider: "openai-compatible-custom", model: "my-model" });
  });
});

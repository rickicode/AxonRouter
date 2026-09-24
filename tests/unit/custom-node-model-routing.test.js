import { describe, it, expect, beforeEach, vi } from "vitest";

// The dashboard model Test button sends "<full-node-id>/<model>" (e.g.
// "openai-compatible-chat-omop/gpt-4o"), while client routing normally sends
// "<prefix>/<model>" (e.g. "omop/gpt-4o"). Both must resolve to the custom
// node, never fall through to the openai inference fallback (which produced
// "No active credentials for provider: openai" 503s on model tests).

const mocks = vi.hoisted(() => ({
  getProviderNodes: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: vi.fn(async () => null),
  getComboByName: vi.fn(async () => null),
  getModelAliases: vi.fn(async () => ({})),
  getProviderNodes: mocks.getProviderNodes,
}));

vi.mock("open-sse/config/coreModelCombos.js", () => ({
  getCoreComboMembers: vi.fn(() => null),
}));

const { getModelInfo } = await import("@/sse/services/model");

describe("custom provider node routing (getModelInfo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderNodes.mockImplementation(async ({ type } = {}) => {
      const nodes = [
        { id: "openai-compatible-chat-omop", prefix: "omop", type: "openai-compatible" },
        { id: "anthropic-compatible-claudeproxy", prefix: "claudeproxy", type: "anthropic-compatible" },
      ];
      return type ? nodes.filter((n) => n.type === type) : nodes;
    });
  });

  it("resolves node id prefix to the custom node (dashboard Test button path)", async () => {
    const info = await getModelInfo("openai-compatible-chat-omop/gpt-4o");
    expect(info.provider).toBe("openai-compatible-chat-omop");
    expect(info.model).toBe("gpt-4o");
  });

  it("resolves user-defined prefix to the custom node", async () => {
    const info = await getModelInfo("omop/gpt-4o");
    expect(info.provider).toBe("openai-compatible-chat-omop");
    expect(info.model).toBe("gpt-4o");
  });

  it("resolves anthropic-compatible node id and prefix", async () => {
    const info = await getModelInfo("anthropic-compatible-claudeproxy/claude-sonnet-5");
    expect(info.provider).toBe("anthropic-compatible-claudeproxy");
    expect(info.model).toBe("claude-sonnet-5");

    const byPrefix = await getModelInfo("claudeproxy/claude-sonnet-5");
    expect(byPrefix.provider).toBe("anthropic-compatible-claudeproxy");
  });

  it("keeps built-in provider prefixes untouched (no node lookup)", async () => {
    const info = await getModelInfo("openrouter/openai/gpt-4o");
    expect(info.provider).not.toBe("openai-compatible-chat-omop");
    // openrouter is a reserved prefix: parsed as built-in, not routed to node
    expect(info.provider).toBe("openrouter");
  });

  it("falls back to inference for unknown prefixes (existing behavior)", async () => {
    const info = await getModelInfo("totally-unknown-prefix/deepseek-v4.1-flash");
    expect(info.provider).not.toBe("openai-compatible-chat-omop");
  });
});

// Regression: custom compatible nodes are transparent proxies. A model id that
// happens to collide with a built-in prefixless rewrite (e.g. "glm-5.3-flash"
// → "z-ai/glm-5.3-flash") must reach the custom upstream unchanged. Rewriting
// it made upstream answer 403 model_not_entitled while the same id worked
// against the upstream directly.
const { getModelUpstreamId } = await import("open-sse/config/providerModels.js");

describe("custom provider node model id passthrough (getModelUpstreamId)", () => {

  it("passes the model id through unchanged for openai-compatible nodes", () => {
    expect(getModelUpstreamId("openai-compatible-chat-runanywhere", "glm-5.3-flash"))
      .toBe("glm-5.3-flash");
    expect(getModelUpstreamId("openai-compatible-chat-omop", "deepseek-v4-flash"))
      .toBe("deepseek-v4-flash");
  });

  it("passes the model id through unchanged for anthropic-compatible nodes", () => {
    expect(getModelUpstreamId("anthropic-compatible-proxy", "glm-5.2"))
      .toBe("glm-5.2");
  });

  it("keeps the built-in prefixless rewrite for built-in providers", () => {
    expect(getModelUpstreamId("cline-free", "glm-5.3-flash"))
      .toBe("z-ai/glm-5.3-flash");
  });

  it("keeps the thinking suffix intact on passthrough", () => {
    expect(getModelUpstreamId("openai-compatible-chat-runanywhere", "glm-5.3-flash(high)"))
      .toBe("glm-5.3-flash(high)");
  });
});

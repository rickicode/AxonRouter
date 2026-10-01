// The Usage page lists providers from two sources:
//   1. active LLM connections (deduped by provider id), and
//   2. noAuth free providers that need no connection (e.g. opencode).
//
// Hidden providers (mimo-free) must NOT be auto-added — they are
// excluded from the Providers page, so surfacing them in Usage (with zero
// connections and zero traffic) is a leak. Regression: mimo-free showed up in
// Usage but nowhere in Providers.
import { describe, it, expect } from "vitest";
import { buildUsageProviderList } from "../../src/shared/utils/usageProviders.js";

const isLLM = () => true;

describe("buildUsageProviderList", () => {
  it("does not auto-add hidden noAuth free providers", () => {
    const freeProviders = {
      opencode: { id: "opencode", name: "OpenCode", noAuth: true },
      "mimo-free": { id: "mimo-free", name: "MiMo Free", noAuth: true, hidden: true },
    };

    const list = buildUsageProviderList({
      connections: [],
      freeProviders,
      isLLMProvider: isLLM,
    });

    const ids = list.map((p) => p.provider);
    expect(ids).toContain("opencode");
     expect(ids).not.toContain("mimo-free");
  });

  it("does not leak hidden providers that have an active connection", () => {
    const list = buildUsageProviderList({
      connections: [
        { provider: "sambanova", isActive: true },
        { provider: "opencode", isActive: true },
      ],
      freeProviders: {},
      isLLMProvider: isLLM,
      isHidden: (id) => id === "sambanova",
    });

    expect(list.map((p) => p.provider)).toEqual(["opencode"]);
  });

  it("includes a hidden provider's connection when the caller does not flag it hidden", () => {
    const list = buildUsageProviderList({
      connections: [{ provider: "sambanova", isActive: true }],
      freeProviders: {},
      isLLMProvider: isLLM,
    });

    expect(list.map((p) => p.provider)).toEqual(["sambanova"]);
  });

  it("includes active LLM connections, deduped by provider", () => {
    const list = buildUsageProviderList({
      connections: [
        { provider: "codex", isActive: true },
        { provider: "codex", isActive: true },
        { provider: "zed", isActive: true },
      ],
      freeProviders: {},
      isLLMProvider: isLLM,
    });
    expect(list.map((p) => p.provider)).toEqual(["codex", "zed"]);
  });

  it("skips inactive connections and non-LLM providers", () => {
    const list = buildUsageProviderList({
      connections: [
        { provider: "codex", isActive: false },
        { provider: "whisper", isActive: true },
      ],
      freeProviders: {},
      isLLMProvider: (id) => id !== "whisper",
    });
    expect(list).toEqual([]);
  });

  it("does not duplicate a free provider that already has a connection", () => {
    const freeProviders = {
      opencode: { id: "opencode", name: "OpenCode", noAuth: true },
    };
    const list = buildUsageProviderList({
      connections: [{ provider: "opencode", isActive: true }],
      freeProviders,
      isLLMProvider: isLLM,
    });
    expect(list.map((p) => p.provider)).toEqual(["opencode"]);
  });

  it("attaches nodeName from the lookup when present", () => {
    const list = buildUsageProviderList({
      connections: [{ provider: "node-1", isActive: true }],
      freeProviders: {},
      nodeNameMap: { "node-1": "My Node" },
      isLLMProvider: isLLM,
    });
    expect(list[0].nodeName).toBe("My Node");
  });
});

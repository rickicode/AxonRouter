import { describe, expect, it } from "vitest";

import { AI_PROVIDERS } from "../../src/shared/constants/providers";
import { PROVIDER_MODELS } from "../../open-sse/config/providerModels";
import { getExecutor } from "../../open-sse/executors/index";
import { DefaultExecutor } from "../../open-sse/executors/default";
import { OpenCodeExecutor } from "../../open-sse/executors/opencode";
import { OpenCodeGoExecutor } from "../../open-sse/executors/opencode-go";
import { OpenCodeZenExecutor } from "../../open-sse/executors/opencode-zen";
import { OpenCodeProviderExecutor } from "../../open-sse/executors/opencode-provider";

describe("OpenCode provider variants", () => {
  const EXPECTED_VARIANTS = [
    { id: "opencode", alias: "oc" },
    { id: "opencode-go", alias: "ocg" },
    { id: "opencode-zen", alias: "ocz" },
    { id: "opencode-provider", alias: "ocp" },
  ];

  it("all 4 OpenCode entries exist in AI_PROVIDERS", () => {
    for (const { id } of EXPECTED_VARIANTS) {
      expect(AI_PROVIDERS[id], `Missing AI_PROVIDERS["${id}"]`).toBeDefined();
    }
  });

  it("each variant has a distinct alias", () => {
    const aliases = EXPECTED_VARIANTS.map(v => AI_PROVIDERS[v.id].alias);
    expect(new Set(aliases).size).toBe(4);
    for (const { id, alias } of EXPECTED_VARIANTS) {
      expect(AI_PROVIDERS[id].alias).toBe(alias);
    }
  });

  it("PROVIDER_MODELS has entries for all 4 variants", () => {
    // opencode uses alias "oc", opencode-go/zen/provider use id as key
    expect(PROVIDER_MODELS["oc"]).toBeDefined();
    expect(PROVIDER_MODELS["oc"].length).toBeGreaterThan(0);

    expect(PROVIDER_MODELS["opencode-go"]).toBeDefined();
    expect(PROVIDER_MODELS["opencode-go"].length).toBeGreaterThan(0);

    expect(PROVIDER_MODELS["opencode-zen"]).toBeDefined();
    expect(PROVIDER_MODELS["opencode-zen"].length).toBeGreaterThan(0);

    expect(PROVIDER_MODELS["opencode-provider"]).toBeDefined();
    expect(PROVIDER_MODELS["opencode-provider"].length).toBeGreaterThan(0);
  });

  it("executors map returns specialized executors for all 4 variants", () => {
    const opencodeExec = getExecutor("opencode");
    const goExec = getExecutor("opencode-go");
    const zenExec = getExecutor("opencode-zen");
    const providerExec = getExecutor("opencode-provider");

    expect(opencodeExec).toBeInstanceOf(OpenCodeExecutor);
    expect(goExec).toBeInstanceOf(OpenCodeGoExecutor);
    expect(zenExec).toBeInstanceOf(OpenCodeZenExecutor);
    expect(providerExec).toBeInstanceOf(OpenCodeProviderExecutor);

    // None should fall back to DefaultExecutor
    expect(opencodeExec).not.toBeInstanceOf(DefaultExecutor);
    expect(goExec).not.toBeInstanceOf(DefaultExecutor);
    expect(zenExec).not.toBeInstanceOf(DefaultExecutor);
    expect(providerExec).not.toBeInstanceOf(DefaultExecutor);
  });

  it("OpenCodeZenExecutor.buildUrl routes claude-format models to /messages", () => {
    const exec = new OpenCodeZenExecutor();
    expect(exec.buildUrl("minimax-m2.7")).toBe("https://opencode.ai/zen/v1/messages");
    expect(exec.buildUrl("qwen3.6-plus")).toBe("https://opencode.ai/zen/v1/messages");
    expect(exec.buildUrl("glm-5")).toBe("https://opencode.ai/zen/v1/chat/completions");
    expect(exec.buildUrl("kimi-k2.5")).toBe("https://opencode.ai/zen/v1/chat/completions");
  });

  it("OpenCodeProviderExecutor.buildUrl routes claude-format models to /messages", () => {
    const exec = new OpenCodeProviderExecutor();
    expect(exec.buildUrl("minimax-m2.5")).toBe("https://opencode.ai/zen/provider/v1/messages");
    expect(exec.buildUrl("qwen3.6-plus")).toBe("https://opencode.ai/zen/provider/v1/messages");
    expect(exec.buildUrl("glm-5")).toBe("https://opencode.ai/zen/provider/v1/chat/completions");
    expect(exec.buildUrl("kimi-k2.5")).toBe("https://opencode.ai/zen/provider/v1/chat/completions");
  });
});

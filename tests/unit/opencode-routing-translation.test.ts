import { describe, it, expect } from "vitest";
import { PROVIDERS } from "../../open-sse/config/providers";
import { PROVIDER_MODELS } from "../../open-sse/config/providerModels";
import { OpenCodeExecutor } from "../../open-sse/executors/opencode";
import { OpenCodeGoExecutor } from "../../open-sse/executors/opencode-go";
import { OpenCodeZenExecutor } from "../../open-sse/executors/opencode-zen";
import { OpenCodeProviderExecutor } from "../../open-sse/executors/opencode-provider";

describe("opencode routing and translation", () => {
  it("opencode-zen has entry in PROVIDERS config", () => {
    expect(PROVIDERS["opencode-zen"]).toBeDefined();
    expect(PROVIDERS["opencode-zen"].format).toBe("openai");
  });

  it("opencode-provider has entry in PROVIDERS config", () => {
    expect(PROVIDERS["opencode-provider"]).toBeDefined();
    expect(PROVIDERS["opencode-provider"].format).toBe("openai");
  });

  it("OpenCodeGoExecutor routes claude-format models to /messages", () => {
    const executor = new OpenCodeGoExecutor();
    const claudeModels = (PROVIDER_MODELS["opencode-go"] || [])
      .filter(m => m.targetFormat === "claude")
      .map(m => m.id);

    expect(claudeModels.length).toBeGreaterThan(0);
    for (const modelId of claudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /messages`).toContain("/messages");
    }
  });

  it("OpenCodeGoExecutor routes non-claude models to /chat/completions", () => {
    const executor = new OpenCodeGoExecutor();
    const nonClaudeModels = (PROVIDER_MODELS["opencode-go"] || [])
      .filter(m => !m.targetFormat)
      .map(m => m.id);

    expect(nonClaudeModels.length).toBeGreaterThan(0);
    for (const modelId of nonClaudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /chat/completions`).toContain("/chat/completions");
    }
  });

  it("OpenCodeZenExecutor routes claude-format models to /messages", () => {
    const executor = new OpenCodeZenExecutor();
    const claudeModels = (PROVIDER_MODELS["opencode-zen"] || [])
      .filter(m => m.targetFormat === "claude")
      .map(m => m.id);

    expect(claudeModels.length).toBeGreaterThan(0);
    for (const modelId of claudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /messages`).toContain("/messages");
    }
  });

  it("OpenCodeZenExecutor routes non-claude models to /chat/completions", () => {
    const executor = new OpenCodeZenExecutor();
    const nonClaudeModels = (PROVIDER_MODELS["opencode-zen"] || [])
      .filter(m => !m.targetFormat)
      .map(m => m.id);

    expect(nonClaudeModels.length).toBeGreaterThan(0);
    for (const modelId of nonClaudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /chat/completions`).toContain("/chat/completions");
    }
  });

  it("OpenCodeProviderExecutor routes claude-format models to /messages", () => {
    const executor = new OpenCodeProviderExecutor();
    const claudeModels = (PROVIDER_MODELS["opencode-provider"] || [])
      .filter(m => m.targetFormat === "claude")
      .map(m => m.id);

    expect(claudeModels.length).toBeGreaterThan(0);
    for (const modelId of claudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /messages`).toContain("/messages");
    }
  });

  it("OpenCodeProviderExecutor routes non-claude models to /chat/completions", () => {
    const executor = new OpenCodeProviderExecutor();
    const nonClaudeModels = (PROVIDER_MODELS["opencode-provider"] || [])
      .filter(m => !m.targetFormat)
      .map(m => m.id);

    expect(nonClaudeModels.length).toBeGreaterThan(0);
    for (const modelId of nonClaudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /chat/completions`).toContain("/chat/completions");
    }
  });

  it("all opencode-go targetFormat:claude models are in executor CLAUDE set", () => {
    const executor = new OpenCodeGoExecutor();
    const claudeModels = (PROVIDER_MODELS["opencode-go"] || [])
      .filter(m => m.targetFormat === "claude")
      .map(m => m.id);

    for (const modelId of claudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /messages`).toContain("/messages");
    }
  });

  it("all opencode-zen targetFormat:claude models are in executor CLAUDE set", () => {
    const executor = new OpenCodeZenExecutor();
    const claudeModels = (PROVIDER_MODELS["opencode-zen"] || [])
      .filter(m => m.targetFormat === "claude")
      .map(m => m.id);

    for (const modelId of claudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /messages`).toContain("/messages");
    }
  });

  it("all opencode-provider targetFormat:claude models are in executor CLAUDE set", () => {
    const executor = new OpenCodeProviderExecutor();
    const claudeModels = (PROVIDER_MODELS["opencode-provider"] || [])
      .filter(m => m.targetFormat === "claude")
      .map(m => m.id);

    for (const modelId of claudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /messages`).toContain("/messages");
    }
  });

  it("OpenCodeExecutor routes oc claude-format models to /messages", () => {
    const executor = new OpenCodeExecutor();
    const claudeModels = (PROVIDER_MODELS["oc"] || [])
      .filter(m => m.targetFormat === "claude")
      .map(m => m.id);

    expect(claudeModels.length).toBeGreaterThan(0);
    for (const modelId of claudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /messages`).toContain("/messages");
    }
  });

  it("OpenCodeExecutor routes oc non-claude models to /chat/completions", () => {
    const executor = new OpenCodeExecutor();
    const nonClaudeModels = (PROVIDER_MODELS["oc"] || [])
      .filter(m => !m.targetFormat)
      .map(m => m.id);

    expect(nonClaudeModels.length).toBeGreaterThan(0);
    for (const modelId of nonClaudeModels) {
      const url = executor.buildUrl(modelId);
      expect(url, `Model ${modelId} should route to /chat/completions`).toContain("/chat/completions");
    }
  });
});

import { describe, expect, it, vi } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDERS, PROVIDER_MODELS } from "../../open-sse/providers/index.js";
import { getModelsByProviderId, getDefaultModel } from "../../open-sse/config/providerModels.js";
import { resolveUnikeyModels, clearUnikeyCatalog } from "../../open-sse/services/unikeyModels.js";
import { getImageAdapter, isImageProvider } from "../../open-sse/handlers/imageProviders/index.js";
import { parseModel } from "../../open-sse/services/model.js";

describe("UniKey provider", () => {
  const unikey = REGISTRY.find((e) => e.id === "unikey");

  it("is registered as an OpenAI-compatible apikey provider with uk alias", () => {
    expect(unikey).toBeDefined();
    expect(unikey.category).toBe("apikey");
    expect(unikey.transport.baseUrl).toBe("https://www.getunikey.ai/v1/chat/completions");
    expect(unikey.alias).toBe("unikey");
    expect(unikey.aliases).toContain("uk");
    expect(unikey.uiAlias).toBe("uk");
  });

  it("exposes default models including claude-opus-4-8 and distinct gemini models", () => {
    const defaultModels = unikey.models.map((m) => m.id);
    expect(defaultModels).toContain("claude-opus-4-8");
    expect(defaultModels).toContain("claude-opus-4-6");
    expect(defaultModels).toContain("gpt-5.6-sol");
    expect(defaultModels).toContain("google/gemini-3.1-pro-preview");
    expect(defaultModels).toContain("google/gemini-3.1-flash-lite");
    expect(defaultModels).toContain("google/gemini-3.5-flash");
    expect(defaultModels).toContain("gemini-3.5-flash");

    // verify google/gemini-3.5-flash and gemini-3.5-flash are distinct
    expect("google/gemini-3.5-flash").not.toBe("gemini-3.5-flash");
    expect(defaultModels).toContain("gpt-5.6-luna");
    expect(defaultModels).toContain("gpt-5.6-terra");
    expect(defaultModels).toContain("z-ai/glm-5.1");
    expect(defaultModels).toContain("deepseek/deepseek-v4-pro");
    expect(defaultModels).toContain("deepseek/deepseek-v4-flash");
    expect(defaultModels).toContain("x-ai/grok-4.3");
    expect(defaultModels.length).toBe(29);
  });

  it("configures modelsFetcher for dynamic discovery", () => {
    expect(unikey.modelsFetcher).toMatchObject({
      url: "https://www.getunikey.ai/v1/models",
      type: "openai",
    });
    expect(unikey.passthroughModels).toBe(true);
  });

  it("builds into PROVIDERS and PROVIDER_MODELS", () => {
    expect(PROVIDERS.unikey).toBeDefined();
    expect(PROVIDERS.unikey.format).toBe("openai");

    const models = getModelsByProviderId("unikey");
    expect(models.map((m) => m.id)).toContain("claude-opus-4-8");
    expect(models.map((m) => m.id)).toContain("google/gemini-3.5-flash");
    expect(models.map((m) => m.id)).toContain("gemini-3.5-flash");
    expect(models.map((m) => m.id)).toContain("google/gemini-3-pro-image");

    // alias uk also resolves
    const ukModels = getModelsByProviderId("uk");
    expect(ukModels.map((m) => m.id)).toContain("claude-opus-4-8");
    expect(ukModels.map((m) => m.id)).toContain("google/gemini-3.5-flash");
    expect(ukModels.map((m) => m.id)).toContain("gemini-3.5-flash");
    expect(ukModels.map((m) => m.id)).toContain("google/gemini-3-pro-image");

    expect(getDefaultModel("unikey")).toBe("claude-opus-4-8");
    expect(getDefaultModel("uk")).toBe("claude-opus-4-8");
  });

  it("resolveUnikeyModels parses upstream /models and caches results", async () => {
    clearUnikeyCatalog();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "claude-opus-4-8", name: "Claude Opus 4.8" },
          { id: "google/gemini-3.5-flash", name: "Google Gemini 3.5 Flash" },
          { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
          { id: "gpt-6-astra", name: "GPT-6 Astra" },
        ],
      }),
    });

    global.fetch = mockFetch;

    const result = await resolveUnikeyModels({ apiKey: "test-key" });
    expect(result).toBeDefined();
    expect(result.models.length).toBe(4);
    expect(result.models.map((m) => m.id)).toContain("gpt-6-astra");

    // Cache hit
    const cachedResult = await resolveUnikeyModels({ apiKey: "test-key" });
    expect(cachedResult.models.length).toBe(4);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    clearUnikeyCatalog();
  });

  it("registers unikey image adapter and routes nested model correctly", () => {
    expect(isImageProvider("unikey")).toBe(true);

    const adapter = getImageAdapter("unikey");
    expect(adapter).toBeDefined();
    expect(typeof adapter.buildUrl).toBe("function");
    expect(typeof adapter.buildHeaders).toBe("function");
    expect(typeof adapter.buildBody).toBe("function");

    expect(adapter.buildUrl("google/gemini-3-pro-image")).toBe(
      "https://www.getunikey.ai/v1/images/generations"
    );

    const headers = adapter.buildHeaders({ apiKey: "test-unikey-key" });
    expect(headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-unikey-key",
    });

    const parsed = parseModel("uk/google/gemini-3-pro-image");
    expect(parsed).toEqual({
      provider: "unikey",
      model: "google/gemini-3-pro-image",
      isAlias: false,
      providerAlias: "uk",
    });

    const body = adapter.buildBody(parsed.model, {
      prompt: "generate a cute robot",
      size: "1024x1024",
    });
    expect(body).toMatchObject({
      model: "google/gemini-3-pro-image",
      prompt: "generate a cute robot",
      n: 1,
      size: "1024x1024",
    });
  });
});

import { describe, expect, it } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { REGISTRY_UI } from "../../open-sse/providers/registry/ui.js";
import { PROVIDERS, PROVIDER_MODELS } from "../../open-sse/providers/index.js";
import { getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { resolveProviderAlias } from "../../open-sse/services/model.js";
import { APIKEY_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";

// Dahl Inference — OpenAI-compatible Gonka node with a PUBLIC /v1/models
// catalogue, so the modelsFetcher needs no key and the seed ids are only a
// convenience subset (passthroughModels accepts everything the node serves).
describe("Dahl Inference provider", () => {
  const entry = REGISTRY.find((e) => e.id === "dahl");

  it("is registered as an apikey provider with its alias and seed models", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("apikey");
    expect(entry.authType).toBe("apikey");
    expect(entry.transport.baseUrl).toBe("https://inference.dahl.global/v1/chat/completions");
    expect(entry.transport.validateUrl).toBe("https://inference.dahl.global/v1/models");
    expect(entry.models.map((m) => m.id)).toEqual([
      "zai-org/GLM-5.3-Flash",
      "deepseek-ai/DeepSeek-V4-Flash-0731",
      "MiniMaxAI/MiniMax-M2.7",
    ]);
  });

  it("keeps the public catalogue fetcher and passthrough models", () => {
    expect(entry.modelsFetcher).toEqual({
      url: "https://inference.dahl.global/v1/models",
      type: "openai",
    });
    expect(entry.passthroughModels).toBe(true);
  });

  it("projects into REGISTRY_UI without leaking server-only transport", () => {
    const ui = REGISTRY_UI.find((e) => e.id === "dahl");
    expect(ui).toBeDefined();
    expect(ui.display.name).toBe("Dahl Inference");
    expect(ui.modelsFetcher).toEqual(entry.modelsFetcher);
    expect(ui.models.map((m) => m.id)).toEqual(entry.models.map((m) => m.id));
    expect(ui.transport).toBeUndefined();
  });

  it("resolves id and alias through the registry-derived maps", () => {
    expect(resolveProviderAlias("dahl")).toBe("dahl");
    expect(resolveProviderAlias("dahl-inference")).toBe("dahl");
    expect(PROVIDERS.dahl.baseUrl).toBe("https://inference.dahl.global/v1/chat/completions");
    expect(PROVIDER_MODELS.dahl.map((m) => m.id)).toContain("MiniMaxAI/MiniMax-M2.7");
    expect(getModelsByProviderId("dahl").length).toBe(3);
    expect(APIKEY_PROVIDERS.dahl).toBeDefined();
    expect(getProvidersByKind("llm").some((p) => p.id === "dahl")).toBe(true);
  });
});
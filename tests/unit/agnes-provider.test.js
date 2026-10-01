import { describe, expect, it } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { REGISTRY_UI } from "../../open-sse/providers/registry/ui.js";
import { PROVIDERS, PROVIDER_MODELS } from "../../open-sse/providers/index.js";
import { getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { resolveProviderAlias } from "../../open-sse/services/model.js";
import { FREE_TIER_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";

// Agnes AI — OpenAI-compatible free-tier gateway. Its live catalogue needs a
// token, so the registry ships a curated seed set plus passthroughModels.
describe("Agnes AI provider", () => {
  const entry = REGISTRY.find((e) => e.id === "agnes");

  it("is registered as a freeTier apikey provider", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("freeTier");
    expect(entry.authType).toBe("apikey");
    expect(entry.transport.baseUrl).toBe("https://apihub.agnes-ai.com/v1/chat/completions");
    expect(entry.transport.validateUrl).toBe("https://apihub.agnes-ai.com/v1/models");
    expect(entry.models.map((m) => m.id)).toEqual([
      "agnes-2.5-flash",
      "agnes-2.5-pro",
      "agnes-2.5-pro-beta",
      "agnes-3.0-flash",
    ]);
    expect(entry.passthroughModels).toBe(true);
  });

  it("projects into REGISTRY_UI without leaking server-only transport", () => {
    const ui = REGISTRY_UI.find((e) => e.id === "agnes");
    expect(ui).toBeDefined();
    expect(ui.category).toBe("freeTier");
    expect(ui.models.map((m) => m.id)).toEqual(entry.models.map((m) => m.id));
    expect(ui.passthroughModels).toBe(true);
    expect(ui.transport).toBeUndefined();
  });

  it("resolves id and alias through the registry-derived maps", () => {
    expect(resolveProviderAlias("agnes")).toBe("agnes");
    expect(resolveProviderAlias("agnes-ai")).toBe("agnes");
    expect(PROVIDERS.agnes.baseUrl).toBe("https://apihub.agnes-ai.com/v1/chat/completions");
    expect(PROVIDER_MODELS.agnes.map((m) => m.id)).toContain("agnes-3.0-flash");
    expect(getModelsByProviderId("agnes-ai").length).toBe(4);
    expect(FREE_TIER_PROVIDERS.agnes).toBeDefined();
    expect(getProvidersByKind("llm").some((p) => p.id === "agnes")).toBe(true);
  });
});
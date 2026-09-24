import { describe, expect, it } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDERS, PROVIDER_MODELS } from "../../open-sse/providers/index.js";
import { getModelsByProviderId, getDefaultModel } from "../../open-sse/config/providerModels.js";
import { resolveProviderAlias } from "../../open-sse/services/model.js";
import { getProviderIconSrc, resolveProviderIconId } from "../../src/shared/utils/providerIcon.js";

describe("OrcaRouter & Token Harbor providers", () => {
  const orcarouter = REGISTRY.find((e) => e.id === "orcarouter");
  const tokenharbor = REGISTRY.find((e) => e.id === "tokenharbor");

  it("registers OrcaRouter as built-in apikey provider with orca alias", () => {
    expect(orcarouter).toBeDefined();
    expect(orcarouter.category).toBe("apikey");
    expect(orcarouter.transport.baseUrl).toBe("https://api.orcarouter.ai/v1/chat/completions");
    expect(orcarouter.alias).toBe("orcarouter");
    expect(orcarouter.aliases).toContain("orca");
    expect(orcarouter.uiAlias).toBe("orca");
    expect(orcarouter.passthroughModels).toBe(true);
    expect(orcarouter.modelsFetcher.url).toBe("https://api.orcarouter.ai/v1/models");

    expect(PROVIDERS.orcarouter).toBeDefined();
    expect(PROVIDERS.orcarouter.format).toBe("openai");
    expect(resolveProviderAlias("orca")).toBe("orcarouter");

    const models = getModelsByProviderId("orcarouter");
    expect(models.length).toBeGreaterThan(0);
    expect(models.map((m) => m.id)).toContain("orcarouter/auto");
    expect(getDefaultModel("orcarouter")).toBe("orcarouter/auto");
  });

  it("registers Token Harbor as built-in apikey provider with th alias", () => {
    expect(tokenharbor).toBeDefined();
    expect(tokenharbor.category).toBe("apikey");
    expect(tokenharbor.transport.baseUrl).toBe("https://tokenharbor.ai/v1/chat/completions");
    expect(tokenharbor.alias).toBe("tokenharbor");
    expect(tokenharbor.aliases).toContain("th");
    expect(tokenharbor.uiAlias).toBe("th");
    expect(tokenharbor.passthroughModels).toBe(true);
    expect(tokenharbor.modelsFetcher.url).toBe("https://tokenharbor.ai/v1/models");

    expect(PROVIDERS.tokenharbor).toBeDefined();
    expect(PROVIDERS.tokenharbor.format).toBe("openai");
    expect(resolveProviderAlias("th")).toBe("tokenharbor");

    const models = getModelsByProviderId("tokenharbor");
    expect(models.length).toBeGreaterThan(0);
    expect(models.map((m) => m.id)).toContain("deepseek/deepseek-v4-flash");
    expect(getDefaultModel("tokenharbor")).toBe("deepseek-v4.1-flash:free");
  });

  it("resolves icon paths for both providers and their aliases", () => {
    expect(resolveProviderIconId("orcarouter")).toBe("orcarouter");
    expect(getProviderIconSrc("orcarouter")).toBe("/providers/orcarouter.png");
    expect(resolveProviderIconId("orca")).toBe("orcarouter");
    expect(getProviderIconSrc("orca")).toBe("/providers/orcarouter.png");

    expect(resolveProviderIconId("tokenharbor")).toBe("tokenharbor");
    expect(getProviderIconSrc("tokenharbor")).toBe("/providers/tokenharbor.png");
    expect(resolveProviderIconId("th")).toBe("tokenharbor");
    expect(getProviderIconSrc("th")).toBe("/providers/tokenharbor.png");
  });

  it("correctly resolves upstreamModelId for both bare and namespaced IDs", async () => {
    const { parseModel } = await import("../../open-sse/services/model.js");
    const { getModelUpstreamId } = await import("../../open-sse/config/providerModels.js");

    // OrcaRouter: auto -> orcarouter/auto
    const p1 = parseModel("orcarouter/auto");
    expect(getModelUpstreamId(p1.provider, p1.model)).toBe("orcarouter/auto");

    const p2 = parseModel("orca/auto");
    expect(getModelUpstreamId(p2.provider, p2.model)).toBe("orcarouter/auto");

    const p3 = parseModel("orcarouter/orcarouter/auto");
    expect(getModelUpstreamId(p3.provider, p3.model)).toBe("orcarouter/auto");

    const p4 = parseModel("orca/claude-opus-5");
    expect(getModelUpstreamId(p4.provider, p4.model)).toBe("anthropic/claude-opus-5");

    // Token Harbor: bare model -> vendor namespaced
    const p5 = parseModel("tokenharbor/gpt-5.6-sol");
    expect(getModelUpstreamId(p5.provider, p5.model)).toBe("gpt-5.6-sol");

    const p6 = parseModel("th/deepseek-v4-flash");
    expect(getModelUpstreamId(p6.provider, p6.model)).toBe("deepseek-v4-flash");

    const p7 = parseModel("th/deepseek/deepseek-v4-flash");
    expect(getModelUpstreamId(p7.provider, p7.model)).toBe("deepseek-v4-flash");
  });
});

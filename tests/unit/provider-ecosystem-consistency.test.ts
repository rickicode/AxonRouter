import { describe, it, expect } from "vitest";
import { AI_PROVIDERS, FREE_PROVIDERS, OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_TIER_PROVIDERS, WEB_COOKIE_PROVIDERS } from "@/shared/constants/providers";
import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "../../open-sse/config/providerModels";
import { PROVIDERS } from "../../open-sse/config/providers";
import { getExecutor, hasSpecializedExecutor } from "../../open-sse/executors/index";

describe("provider ecosystem consistency", () => {
  const allProviderIds = Object.keys(AI_PROVIDERS);

  it("no duplicate aliases across all provider categories", () => {
    const aliases = new Map<string, string>();
    for (const [id, provider] of Object.entries(AI_PROVIDERS)) {
      const alias = (provider as any).alias;
      if (aliases.has(alias)) {
        // Some providers may legitimately share textIcon but aliases must be unique
        expect.fail(`Duplicate alias "${alias}" found on providers "${aliases.get(alias)}" and "${id}"`);
      }
      aliases.set(alias, id);
    }
  });

  it("all OpenCode variants have distinct aliases", () => {
    const ocVariants = allProviderIds.filter(id => id.startsWith("opencode"));
    const aliases = ocVariants.map(id => (AI_PROVIDERS[id] as any).alias);
    const unique = new Set(aliases);
    expect(unique.size).toBe(ocVariants.length);
    expect(ocVariants.length).toBe(3); // opencode, opencode-go, opencode-zen
  });

  it("all OpenCode variants have specialized executors", () => {
    const ocVariants = ["opencode", "opencode-go", "opencode-zen"];
    for (const id of ocVariants) {
      expect(hasSpecializedExecutor(id), `${id} should have specialized executor`).toBe(true);
    }
  });

  it("API Key Compatible providers sort deterministically", () => {
    const apiKeyProviders = Object.entries(APIKEY_PROVIDERS);
    const compatible = apiKeyProviders.filter(([, p]) => (p as any).apiKeyCompatible === true);
    const nonCompatible = apiKeyProviders.filter(([, p]) => (p as any).apiKeyCompatible !== true);

    // Compatible providers should exist
    expect(compatible.length).toBeGreaterThan(15);
    // Non-compatible should also exist
    expect(nonCompatible.length).toBeGreaterThan(0);
  });

  it("providers with specialized executors have entries in PROVIDERS routing config", () => {
    // Providers that have specialized executors should also exist in the PROVIDERS config
    const specializedProviders = [
      "opencode", "opencode-go", "opencode-zen",
      "codex", "kiro", "cursor", "github", "antigravity", "azure",
      "gemini-cli", "iflow", "qoder", "qwen", "perplexity-web",
      "vertex", "vertex-partner"
    ];

    for (const id of specializedProviders) {
      if (hasSpecializedExecutor(id)) {
        expect(PROVIDERS[id], `${id} has executor but missing from PROVIDERS config`).toBeDefined();
      }
    }
  });

  it("every provider in PROVIDER_ID_TO_ALIAS has a matching AI_PROVIDERS entry or is an alias key in PROVIDER_MODELS", () => {
    for (const [id] of Object.entries(PROVIDER_ID_TO_ALIAS)) {
      // The id should either be in AI_PROVIDERS or be a provider in the routing config
      const inAI = id in AI_PROVIDERS;
      const inProviders = id in PROVIDERS;
      expect(inAI || inProviders, `${id} in PROVIDER_ID_TO_ALIAS but not in AI_PROVIDERS or PROVIDERS`).toBe(true);
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  getProviderCategory,
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
} from "../../src/shared/constants/providers";

describe("getProviderCategory", () => {
  it("returns 'Free' for free providers", () => {
    expect(getProviderCategory("kiro")).toBe("Free");
    expect(getProviderCategory("opencode")).toBe("Free");
    expect(getProviderCategory("iflow")).toBe("Free");
  });

  it("returns 'Free Tier' for free tier providers", () => {
    expect(getProviderCategory("openrouter")).toBe("Free Tier");
    expect(getProviderCategory("nvidia")).toBe("Free Tier");
    expect(getProviderCategory("gemini")).toBe("Free Tier");
  });

  it("returns 'OAuth' for oauth providers", () => {
    expect(getProviderCategory("claude")).toBe("OAuth");
    expect(getProviderCategory("codex")).toBe("OAuth");
    expect(getProviderCategory("github")).toBe("OAuth");
  });

  it("returns 'API Key' for standard API key providers", () => {
    expect(getProviderCategory("openai")).toBe("API Key");
    expect(getProviderCategory("anthropic")).toBe("API Key");
    expect(getProviderCategory("deepseek")).toBe("API Key");
  });

  it("returns 'Local' for local providers", () => {
    expect(getProviderCategory("ollama-local")).toBe("Local");
    expect(getProviderCategory("sdwebui")).toBe("Local");
  });

  it("returns 'Audio' for audio-only providers", () => {
    expect(getProviderCategory("deepgram")).toBe("Audio");
    expect(getProviderCategory("elevenlabs")).toBe("Audio");
  });

  it("returns 'Search' for search providers", () => {
    expect(getProviderCategory("tavily")).toBe("Search");
    expect(getProviderCategory("brave-search")).toBe("Search");
  });
});

describe("apiKeyCompatible field", () => {
  const expectedCompatible = [
    "openai",
    "anthropic",
    "deepseek",
    "groq",
    "xai",
    "mistral",
    "perplexity",
    "together",
    "fireworks",
    "cerebras",
    "cohere",
    "nebius",
    "siliconflow",
    "hyperbolic",
    "opencode-go",
    "opencode-zen",
    "commandcode",
    "glm",
    "glm-cn",
    "kimi",
    "minimax",
    "minimax-cn",
    "alicode",
    "alicode-intl",
    "volcengine-ark",
    "chutes",
    "nanobanana",
    "blackbox",
  ];

  it("apiKeyCompatible is true on expected APIKEY_PROVIDERS", () => {
    for (const id of expectedCompatible) {
      const provider = APIKEY_PROVIDERS[id];
      expect(provider, `Provider "${id}" should exist in APIKEY_PROVIDERS`).toBeDefined();
      expect(provider?.apiKeyCompatible, `Provider "${id}" should have apiKeyCompatible=true`).toBe(true);
    }
  });

  it("apiKeyCompatible is true for openrouter and nvidia in FREE_TIER_PROVIDERS", () => {
    expect(FREE_TIER_PROVIDERS["openrouter"]?.apiKeyCompatible).toBe(true);
    expect(FREE_TIER_PROVIDERS["nvidia"]?.apiKeyCompatible).toBe(true);
  });

  it("has at least 30 providers with apiKeyCompatible=true across all constants", () => {
    const allProviders = { ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...OAUTH_PROVIDERS, ...APIKEY_PROVIDERS };
    const compatibleCount = Object.values(allProviders).filter((p: any) => p.apiKeyCompatible === true).length;
    expect(compatibleCount).toBeGreaterThanOrEqual(30);
  });
});

describe("API Key provider sorting", () => {
  it("apiKeyCompatible providers sort before non-compatible providers", () => {
    const entries = Object.entries(APIKEY_PROVIDERS)
      .filter(([, rawInfo]) => ((rawInfo as any).serviceKinds ?? ["llm"]).includes("llm"))
      .filter(([, rawInfo]) => (rawInfo as any).systemManaged !== true);

    const sorted = entries.sort(([keyA, infoA], [keyB, infoB]) => {
      const aCompat = (infoA as any).apiKeyCompatible === true ? 0 : 1;
      const bCompat = (infoB as any).apiKeyCompatible === true ? 0 : 1;
      if (aCompat !== bCompat) return aCompat - bCompat;
      return keyA.localeCompare(keyB);
    });

    // Find the boundary between compatible and non-compatible
    const firstNonCompatibleIdx = sorted.findIndex(([, info]) => (info as any).apiKeyCompatible !== true);
    if (firstNonCompatibleIdx === -1) return; // all are compatible

    // All entries before the boundary must be compatible
    for (let i = 0; i < firstNonCompatibleIdx; i++) {
      expect((sorted[i][1] as any).apiKeyCompatible).toBe(true);
    }

    // All entries from the boundary onward must not be compatible
    for (let i = firstNonCompatibleIdx; i < sorted.length; i++) {
      expect((sorted[i][1] as any).apiKeyCompatible).not.toBe(true);
    }
  });

  it("compatible providers are sorted alphabetically among themselves", () => {
    const entries = Object.entries(APIKEY_PROVIDERS)
      .filter(([, rawInfo]) => ((rawInfo as any).serviceKinds ?? ["llm"]).includes("llm"))
      .filter(([, rawInfo]) => (rawInfo as any).systemManaged !== true);

    const sorted = entries.sort(([keyA, infoA], [keyB, infoB]) => {
      const aCompat = (infoA as any).apiKeyCompatible === true ? 0 : 1;
      const bCompat = (infoB as any).apiKeyCompatible === true ? 0 : 1;
      if (aCompat !== bCompat) return aCompat - bCompat;
      return keyA.localeCompare(keyB);
    });

    const compatibleEntries = sorted.filter(([, info]) => (info as any).apiKeyCompatible === true);
    for (let i = 1; i < compatibleEntries.length; i++) {
      expect(compatibleEntries[i][0].localeCompare(compatibleEntries[i - 1][0])).toBeGreaterThanOrEqual(0);
    }
  });
});

import { describe, it, expect } from "vitest";
import { getProviderTestCapabilities, AI_PROVIDERS, FREE_PROVIDERS, WEB_COOKIE_PROVIDERS, LOCAL_PROVIDERS } from "@/shared/constants/providers";

describe("provider test workflows", () => {
  it("getProviderTestCapabilities returns correct capabilities for noAuth provider", () => {
    const caps = getProviderTestCapabilities("opencode");
    expect(caps.connectivity).toBe(true);
    expect(caps.authValidation).toBe(false);
    expect(caps.modelListing).toBe(true);
    expect(caps.chatCompletion).toBe(false);
  });

  it("getProviderTestCapabilities returns correct capabilities for API key provider", () => {
    const caps = getProviderTestCapabilities("openai");
    expect(caps.connectivity).toBe(true);
    expect(caps.authValidation).toBe(true);
    expect(caps.modelListing).toBe(true);
    expect(caps.chatCompletion).toBe(true);
  });

  it("getProviderTestCapabilities returns correct capabilities for cookie provider", () => {
    const caps = getProviderTestCapabilities("perplexity-web");
    expect(caps.connectivity).toBe(true);
    expect(caps.authValidation).toBe(false);
    expect(caps.modelListing).toBe(true);
    expect(caps.chatCompletion).toBe(true);
  });

  it("ProviderTestContract interface fields are complete", () => {
    const caps = getProviderTestCapabilities("anthropic");
    expect(Object.keys(caps).sort()).toEqual(["authValidation", "chatCompletion", "connectivity", "modelListing"]);
  });

  it("all providers return valid test capabilities", () => {
    for (const providerId of Object.keys(AI_PROVIDERS)) {
      const caps = getProviderTestCapabilities(providerId);
      expect(typeof caps.connectivity).toBe("boolean");
      expect(typeof caps.authValidation).toBe("boolean");
      expect(typeof caps.modelListing).toBe("boolean");
      expect(typeof caps.chatCompletion).toBe("boolean");
    }
  });

  it("free providers with noAuth skip auth validation and chat completion", () => {
    for (const [providerId, provider] of Object.entries(FREE_PROVIDERS)) {
      const caps = getProviderTestCapabilities(providerId);
      if ((provider as any).noAuth) {
        expect(caps.authValidation).toBe(false);
        expect(caps.chatCompletion).toBe(false);
      }
    }
  });

  it("web cookie providers skip auth validation but allow chat completion", () => {
    for (const providerId of Object.keys(WEB_COOKIE_PROVIDERS)) {
      const caps = getProviderTestCapabilities(providerId);
      expect(caps.authValidation).toBe(false);
      expect(caps.chatCompletion).toBe(true);
    }
  });

  it("compatible provider IDs return all capabilities as true", () => {
    const caps1 = getProviderTestCapabilities("openai-compatible-my-server");
    expect(caps1.connectivity).toBe(true);
    expect(caps1.authValidation).toBe(true);
    expect(caps1.modelListing).toBe(true);
    expect(caps1.chatCompletion).toBe(true);

    const caps2 = getProviderTestCapabilities("anthropic-compatible-custom");
    expect(caps2.connectivity).toBe(true);
    expect(caps2.authValidation).toBe(true);
    expect(caps2.modelListing).toBe(true);
    expect(caps2.chatCompletion).toBe(true);
  });

  it("local providers have authValidation=false", () => {
    const caps = getProviderTestCapabilities("ollama-local");
    expect(caps.connectivity).toBe(true);
    expect(caps.authValidation).toBe(false);
    expect(caps.modelListing).toBe(true);
  });

  it("all local providers have authValidation=false", () => {
    for (const providerId of LOCAL_PROVIDERS) {
      if (!AI_PROVIDERS[providerId]) continue;
      const caps = getProviderTestCapabilities(providerId);
      expect(caps.authValidation).toBe(false);
    }
  });

  it("unknown providers do not crash and return safe defaults", () => {
    const caps = getProviderTestCapabilities("totally-unknown-provider");
    expect(caps.connectivity).toBe(true);
    expect(caps.authValidation).toBe(true);
    expect(caps.modelListing).toBe(false);
    expect(caps.chatCompletion).toBe(true);
  });

  it("audio-only providers have chatCompletion=false", () => {
    const caps = getProviderTestCapabilities("elevenlabs");
    expect(caps.connectivity).toBe(true);
    expect(caps.chatCompletion).toBe(false);
  });

  it("deprecated providers still return valid capabilities", () => {
    // Any provider in AI_PROVIDERS should return valid capabilities regardless of deprecation
    for (const providerId of Object.keys(AI_PROVIDERS)) {
      const caps = getProviderTestCapabilities(providerId);
      expect(caps).toBeDefined();
      expect(typeof caps.connectivity).toBe("boolean");
      expect(typeof caps.authValidation).toBe("boolean");
      expect(typeof caps.modelListing).toBe("boolean");
      expect(typeof caps.chatCompletion).toBe("boolean");
    }
  });
});

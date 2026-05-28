import { describe, it, expect } from "vitest";
import { getProviderTestCapabilities, AI_PROVIDERS, FREE_PROVIDERS, WEB_COOKIE_PROVIDERS } from "@/shared/constants/providers";

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
    const caps = getProviderTestCapabilities("grok-web");
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
});

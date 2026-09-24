import { describe, it, expect } from "vitest";
import unikey from "../../open-sse/providers/registry/unikey.js";
import {
  USAGE_SUPPORTED_PROVIDERS,
  USAGE_APIKEY_PROVIDERS,
} from "../../src/shared/constants/providers.js";
describe("UniKey quota exclusion", () => {
  it("does not advertise upstream quota support", () => {
    expect(unikey.features.usage).toBe(false);
    expect(unikey.features.usageApikey).toBe(false);
    expect(USAGE_SUPPORTED_PROVIDERS).not.toContain("unikey");
    expect(USAGE_APIKEY_PROVIDERS).not.toContain("unikey");
  });
  it("retains media and LLM routing", () => {
    expect(unikey.serviceKinds).toEqual(
      expect.arrayContaining(["llm", "video", "image"]),
    );
    expect(unikey.models.length).toBeGreaterThan(0);
  });
});

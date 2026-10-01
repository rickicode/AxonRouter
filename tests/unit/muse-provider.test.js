import { describe, expect, it } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { REGISTRY_UI } from "../../open-sse/providers/registry/ui.js";
import { PROVIDER_OAUTH, PROVIDERS, PROVIDER_MODELS } from "../../open-sse/providers/index.js";
import { resolveProviderAlias } from "../../open-sse/services/model.js";
import { PROVIDER_PRICING, MODEL_PRICING } from "../../open-sse/providers/pricing.js";
import { getProvider, getProviderNames } from "../../src/lib/oauth/providers/index.js";
import { MUSE_CONFIG } from "../../src/lib/oauth/constants/oauth.js";
import { OAUTH_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";

// Muse (Meta Model API) — dual auth: Muse Code subscription via Meta device code
// (mints an LLM|... key) or a pay-as-you-go key from dev.meta.ai.
describe("Muse provider", () => {
  const entry = REGISTRY.find((e) => e.id === "muse");

  it("is registered as a dual-auth oauth provider with both wire formats", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("oauth");
    expect(entry.hasOAuth).toBe(true);
    expect(entry.authModes).toEqual(["oauth", "apikey"]);
    expect(entry.transport.baseUrl).toBe("https://api.meta.ai/v1/chat/completions");
    expect(entry.transport.auth).toMatchObject({ header: "Authorization", scheme: "bearer", hooks: ["museHeaders"] });
    // Muse Spark reasoning only round-trips on the Responses endpoint.
    expect(entry.transports.map((t) => t.format)).toEqual(["openai", "openai-responses"]);
    expect(entry.transports[1].baseUrl).toBe("https://api.meta.ai/v1/responses");
    expect(entry.models.map((m) => m.id)).toContain("muse-spark-1.3");
    expect(entry.models.every((m) => m.targetFormat === "openai-responses")).toBe(true);
    expect(entry.passthroughModels).toBe(true);
  });

  it("declares the Meta device-code endpoints on the oauth block", () => {
    expect(entry.oauth).toMatchObject({
      clientId: "1031625952748946",
      deviceCodeUrl: "https://auth.meta.com/oidc/device/authorization/",
      tokenUrl: "https://auth.meta.com/oidc/device/token/",
    });
    expect(PROVIDER_OAUTH.muse).toEqual(entry.oauth);
    expect(MUSE_CONFIG.clientId).toBe(entry.oauth.clientId);
  });

  it("projects into REGISTRY_UI without leaking the oauth block or transport", () => {
    const ui = REGISTRY_UI.find((e) => e.id === "muse");
    expect(ui).toBeDefined();
    expect(ui.hasOAuth).toBe(true);
    expect(ui.authModes).toEqual(["oauth", "apikey"]);
    expect(ui.models.map((m) => m.id)).toEqual(entry.models.map((m) => m.id));
    expect(ui.oauth).toBeUndefined();
    expect(ui.transport).toBeUndefined();
    expect(ui.transports).toBeUndefined();
  });

  it("resolves id and aliases through the registry-derived maps", () => {
    expect(resolveProviderAlias("muse")).toBe("muse");
    expect(resolveProviderAlias("muse-code")).toBe("muse");
    expect(resolveProviderAlias("meta-model-api")).toBe("muse");
    expect(PROVIDERS.muse.baseUrl).toBe("https://api.meta.ai/v1/chat/completions");
    expect(PROVIDER_MODELS.muse.map((m) => m.id)).toContain("muse-spark-1.2-contributor");
    expect(OAUTH_PROVIDERS.muse).toBeDefined();
    expect(getProvidersByKind("llm").some((p) => p.id === "muse")).toBe(true);
  });

  it("is wired into the OAuth provider registry as a device-code flow", () => {
    expect(getProviderNames()).toContain("muse");
    const muse = getProvider("muse");
    expect(muse.flowType).toBe("device_code");
    expect(typeof muse.requestDeviceCode).toBe("function");
    expect(typeof muse.pollToken).toBe("function");
    expect(typeof muse.postExchange).toBe("function");
    expect(muse.config.deviceCodeUrl).toBe(entry.oauth.deviceCodeUrl);
  });

  it("carries per-model pricing for Muse Spark ids", () => {
    // Contributor-tier ids are the cheap ones (cheaper rate, Meta may train).
    expect(PROVIDER_PRICING.muse).toBeUndefined();
    expect(MODEL_PRICING["muse-spark-1.3"]).toMatchObject({ input: 1.25, output: 4.25 });
    expect(MODEL_PRICING["muse-spark-1.3-contributor"]).toMatchObject({ input: 0.1, output: 0.2 });
  });

  it("sends x-api-version only for subscription (accessToken) credentials", async () => {
    // The registry auth hook is what makes this provider's dual auth work: a
    // minted subscription key needs x-api-version, a plain Model API key must
    // not receive it.
    const { DefaultExecutor } = await import("../../open-sse/executors/default.js");
    const ex = new DefaultExecutor("muse");
    const sub = ex.buildHeaders({ accessToken: "LLM|abc" }, false, entry.transport.baseUrl, "muse-spark-1.3");
    expect(sub.Authorization).toBe("Bearer LLM|abc");
    expect(sub["x-api-version"]).toBe("1.0.0");

    const keyed = ex.buildHeaders({ apiKey: "LLM|def" }, false, entry.transport.baseUrl, "muse-spark-1.3");
    expect(keyed.Authorization).toBe("Bearer LLM|def");
    expect(keyed["x-api-version"]).toBeUndefined();
  });
});
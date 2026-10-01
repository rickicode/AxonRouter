import { describe, expect, it } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { REGISTRY_UI } from "../../open-sse/providers/registry/ui.js";
import { PROVIDER_MEDIA, PROVIDERS } from "../../open-sse/providers/index.js";
import { resolveProviderAlias } from "../../open-sse/services/model.js";
import { JEV_MODEL_CHOICES, JEV_PROVIDERS, isKnownJevEndpoint } from "../../open-sse/config/jevModels.js";
import { APIKEY_PROVIDERS, MEDIA_PROVIDER_KINDS, getProvidersByKind } from "@/shared/constants/providers";

// v1m — System One decision engine. Upstream labels this a native `systemone`
// provider; this tree generalized that subsystem to `jev`, so the entry declares
// jevConfig and joins the classifier picker/key pool exactly as typesafe does.
describe("v1m System One provider", () => {
  const entry = REGISTRY.find((e) => e.id === "v1m");

  it("is registered as a key-pooled Jev apikey provider", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("apikey");
    expect(entry.serviceKinds).toEqual(["jev"]);
    expect(entry.jevConfig).toMatchObject({ endpoint: "https://v1m.ir/v1/systemone", keyPool: true });
    expect(entry.jevConfig.models.map((m) => m.id)).toEqual(["rev-latest", "v1m-decision-engine"]);
    expect(entry.jevConfig.models.find((m) => m.id === "rev-latest").default).toBe(true);
    expect(entry.models.map((m) => m.id)).toEqual(["rev-latest", "v1m-decision-engine"]);
  });

  it("projects into REGISTRY_UI with the jevConfig intact", () => {
    const ui = REGISTRY_UI.find((e) => e.id === "v1m");
    expect(ui).toBeDefined();
    expect(ui.serviceKinds).toEqual(entry.serviceKinds);
    expect(ui.jevConfig).toEqual(entry.jevConfig);
    expect(ui.transport).toBeUndefined();
  });

  it("resolves id and aliases through the registry-derived maps", () => {
    expect(resolveProviderAlias("v1m")).toBe("v1m");
    expect(resolveProviderAlias("systemone")).toBe("v1m");
    // `jev` is TypeSafe's alias and must stay with it — v1m must not steal it.
    expect(resolveProviderAlias("jev")).toBe("typesafe");
    expect(PROVIDER_MEDIA.v1m.jevConfig.endpoint).toBe("https://v1m.ir/v1/systemone");
    expect(APIKEY_PROVIDERS.v1m).toBeDefined();
  });

  it("is offered by the Jev classifier picker as a capabilities provider", () => {
    const jevKind = MEDIA_PROVIDER_KINDS.find((k) => k.id === "jev");
    expect(jevKind).toBeDefined();

    expect(JEV_PROVIDERS.map((p) => p.provider)).toContain("v1m");
    expect(JEV_MODEL_CHOICES.map((c) => c.value)).toEqual(expect.arrayContaining(["rev-latest", "v1m-decision-engine"]));
    expect(isKnownJevEndpoint("https://v1m.ir/v1/systemone")).toBe(true);
    expect(getProvidersByKind("jev").some((p) => p.id === "v1m")).toBe(true);
  });

  it("names the pinned (provider, model) pair the classifier resolver accepts", async () => {
    const { jevProviderById, jevModelMeta } = await import("../../open-sse/config/jevModels.js");
    const provider = jevProviderById("v1m");
    expect(provider).toMatchObject({ endpoint: "https://v1m.ir/v1/systemone", keyPool: true });
    expect(jevModelMeta("rev-latest")).toMatchObject({ provider: "v1m", endpoint: "https://v1m.ir/v1/systemone" });
    // The picker keys on the uiAlias; the extra `systemone` alias is a routing
    // alias only (resolveProviderAlias), not a classifier-provider name.
    expect(jevProviderById("v1m")?.endpoint).toBe("https://v1m.ir/v1/systemone");
    expect(jevProviderById("systemone")).toBeNull();
  });
});
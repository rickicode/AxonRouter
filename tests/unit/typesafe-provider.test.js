import { describe, it, expect, vi } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { REGISTRY_UI } from "../../open-sse/providers/registry/ui.js";
import { PROVIDER_MODELS, PROVIDERS } from "../../open-sse/providers/index.js";
import {
  JEV_MODEL_CHOICES,
  DEFAULT_JEV_MODEL,
  jevEndpointForModel,
  isKnownJevEndpoint,
  TYPESAFE_SYSTEMONE_URL,
  ZEN_SYSTEMONE_URL,
} from "../../open-sse/config/jevModels.js";
import { mergeWithDefaults } from "../../src/lib/db/repos/settingsRepo.js";

const mockState = {
  settings: { judgeMode: "two-layer", jevModel: DEFAULT_JEV_MODEL, password: "hashed-password" },
  saved: null,
};

vi.mock("@/lib/localDb", () => ({
  getSettings: vi.fn(async () => mockState.settings),
  updateSettings: vi.fn(async (updates) => {
    mockState.saved = updates;
    mockState.settings = { ...mockState.settings, ...updates };
    return mockState.settings;
  }),
}));
vi.mock("@/lib/network/outboundProxy", () => ({ applyOutboundProxyEnv: vi.fn() }));
vi.mock("open-sse/services/combo.js", () => ({ resetComboRotation: vi.fn() }));

// Name of the retired single-provider judge key. Spelled by concatenation so the
// removal stays grep-verifiable across the suite.
const LEGACY_JUDGE_KEY = "typeSafe" + "ApiKey";

describe("typesafe provider registry entry", () => {
  const entry = REGISTRY.find((r) => r.id === "typesafe");

  it("is registered in the server registry", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("apikey");
    expect(entry.display.name).toBe("TypeSafe AI (Jev)");
    expect(entry.display.notice.apiKeyUrl).toBe("https://console.typesafe.ai");
    expect(entry.transport.baseUrl).toBe("https://api.typesafe.ai/v1");
    expect(entry.transport.validateUrl).toBe("https://api.typesafe.ai/v1/models");
    expect(entry.models).toEqual([{ id: "jev-latest", name: "Jev Latest (System One)", kind: "jev", targetFormat: "systemone", default: true }]);
  });

  it("is exposed to the dashboard through REGISTRY_UI (providers + capabilities menus)", () => {
    const ui = REGISTRY_UI.find((r) => r.id === "typesafe");
    expect(ui).toBeDefined();
    expect(ui.category).toBe("apikey");
    expect(ui.display.name).toBe("TypeSafe AI (Jev)");
    expect(ui.models.map((m) => m.id)).toEqual(["jev-latest"]);
    // server-only transport keys stay out of the client projection
    expect(ui.transport).toBeUndefined();
  });

  it("is accepted as an API-key provider (dashboard grid + POST /api/providers gate)", async () => {
    const { APIKEY_PROVIDERS, AI_PROVIDERS } = await import("../../src/shared/constants/providers.js");
    expect(APIKEY_PROVIDERS.typesafe).toBeDefined();
    expect(AI_PROVIDERS.typesafe.name).toBe("TypeSafe AI (Jev)");
  });

  it("exposes its model through PROVIDER_MODELS for routing/validation", () => {
    expect(PROVIDER_MODELS.typesafe.map((m) => m.id)).toContain("jev-latest");
    expect(PROVIDERS.typesafe.baseUrl).toBe("https://api.typesafe.ai/v1");
  });

  it("is exposed as a capabilities provider under kind 'jev'", async () => {
    const { getProvidersByKind, MEDIA_PROVIDER_KINDS } = await import("../../src/shared/constants/providers.js");
    const jevKind = MEDIA_PROVIDER_KINDS.find((k) => k.id === "jev");
    expect(jevKind).toBeDefined();
    expect(jevKind.endpoint.path).toBe("/v1/systemone");

    const jevProviders = getProvidersByKind("jev");
    expect(jevProviders.map((p) => p.id)).toEqual(expect.arrayContaining(["typesafe", "opencode-zen"]));
  });
});

describe("registry jevConfig declarations", () => {
  it("opencode (alias 'oc') declares a keyless Jev upstream mirrored in REGISTRY_UI", () => {
    const entry = REGISTRY.find((r) => r.id === "opencode");
    expect(entry.alias).toBe("oc");
    expect(entry.serviceKinds).toContain("jev");
    expect(entry.jevConfig.endpoint).toBe("https://opencode.ai/zen/v1/systemone");
    expect(entry.jevConfig.models.map((m) => m.id)).toEqual(["jev-1.13-free", "jev-1.13"]);
    expect(entry.jevConfig.models.find((m) => m.id === "jev-1.13-free").default).toBe(true);
    expect(entry.jevConfig.models.find((m) => m.id === "jev-1.13").requiresKey).toBe(true);
    expect("keyPool" in entry.jevConfig).toBe(false);

    const ui = REGISTRY_UI.find((r) => r.id === "opencode");
    expect(ui.serviceKinds).toEqual(entry.serviceKinds);
    expect(ui.jevConfig).toEqual(entry.jevConfig);
  });

  it("opencode-zen declares a key-pooled Jev upstream", () => {
    const entry = REGISTRY.find((r) => r.id === "opencode-zen");
    expect(entry.serviceKinds).toContain("jev");
    expect(entry.jevConfig).toMatchObject({
      endpoint: "https://opencode.ai/zen/v1/systemone",
      keyPool: true,
    });
    expect(entry.jevConfig.models.map((m) => m.id)).toEqual(["jev-1.13-free", "jev-1.13"]);

    const ui = REGISTRY_UI.find((r) => r.id === "opencode-zen");
    expect(ui.jevConfig).toEqual(entry.jevConfig);
  });

  it("typesafe declares a key-pooled Jev upstream", () => {
    const entry = REGISTRY.find((r) => r.id === "typesafe");
    expect(entry.serviceKinds).toContain("jev");
    expect(entry.jevConfig).toMatchObject({
      endpoint: "https://api.typesafe.ai/v1/systemone",
      keyPool: true,
    });
    expect(entry.jevConfig.models.map((m) => m.id)).toEqual(["jev-latest"]);
    expect(entry.jevConfig.models[0].requiresKey).toBe(true);

    const ui = REGISTRY_UI.find((r) => r.id === "typesafe");
    expect(ui.jevConfig).toEqual(entry.jevConfig);
  });
});

describe("OpenCode Zen Jev models", () => {
  const zen = REGISTRY.find((r) => r.id === "opencode-zen");
  const zenIds = zen.models.filter((m) => m.id.startsWith("jev"));

  it("declares both Jev classifier models", () => {
    expect(zenIds.map((m) => m.id)).toEqual(["jev-1.13-free", "jev-1.13"]);
    expect(zenIds[0]).toMatchObject({
      name: "Jev 1.13 Free (System One)",
      targetFormat: "systemone",
      default: true,
    });
    expect(zenIds[1]).toMatchObject({
      name: "Jev 1.13 (System One)",
      targetFormat: "systemone",
    });
  });

  it("projects both models into REGISTRY_UI and PROVIDER_MODELS", () => {
    const ui = REGISTRY_UI.find((r) => r.id === "opencode-zen");
    expect(ui.models.map((m) => m.id)).toEqual(expect.arrayContaining(["jev-1.13-free", "jev-1.13"]));
    expect(PROVIDER_MODELS["opencode-zen"].map((m) => m.id)).toEqual(
      expect.arrayContaining(["jev-1.13-free", "jev-1.13"])
    );
  });
});

describe("Jev model picker data + settings defaults", () => {
  it("offers every registry-declared (provider, model) option in priority order", () => {
    expect(JEV_MODEL_CHOICES.map((c) => `${c.provider}|${c.value}`)).toEqual([
      "typesafe|jev-latest",
      "opencode|jev-1.13-free",
      "opencode|jev-1.13",
      "beatapi|jev-1.13-free",
      "v1m|rev-latest",
      "v1m|v1m-decision-engine",
      "opencode-zen|jev-1.13-free",
      "opencode-zen|jev-1.13",
    ]);

    const free = JEV_MODEL_CHOICES.find((c) => c.value === "jev-1.13-free" && c.provider === "opencode");
    expect(free).toMatchObject({
      default: true,
      provider: "opencode",
      providerLabel: "OpenCode Free",
      keyPool: false,
      keyEnv: "OPENCODE_API_KEY",
      requiresKey: false,
    });

    expect(DEFAULT_JEV_MODEL).toBe("jev-1.13-free");
    expect(jevEndpointForModel("jev-1.13-free")).toBe(ZEN_SYSTEMONE_URL);
    expect(jevEndpointForModel("jev-1.13")).toBe(ZEN_SYSTEMONE_URL);
    expect(jevEndpointForModel("jev-latest")).toBe(TYPESAFE_SYSTEMONE_URL);
    expect(jevEndpointForModel("unknown-model")).toBeNull();
    expect(isKnownJevEndpoint(TYPESAFE_SYSTEMONE_URL)).toBe(true);
    expect(isKnownJevEndpoint(ZEN_SYSTEMONE_URL)).toBe(true);
    expect(isKnownJevEndpoint("https://evil.example/v1/systemone")).toBe(false);
  });

  it("defaults the judge settings to the free Zen model with no provider pin and no keys", () => {
    const settings = mergeWithDefaults({});
    expect(settings.jevModel).toBe("jev-1.13-free");
    expect(settings.jevProvider).toBe("");
    expect(settings.jevApiKeys).toEqual({});
    expect((LEGACY_JUDGE_KEY in settings)).toBe(false);
  });

  it("PATCH validates the judge model/provider/threshold", async () => {
    const { PATCH } = await import("../../src/app/api/settings/route.js");

    const badModel = await PATCH({ json: async () => ({ jevModel: "gpt-6" }) });
    expect(badModel.status).toBe(400);

    const goodModel = await PATCH({ json: async () => ({ jevModel: "jev-latest" }) });
    expect(goodModel.status).toBe(200);
    expect(mockState.saved.jevModel).toBe("jev-latest");

    const badProvider = await PATCH({ json: async () => ({ jevProvider: "nope" }) });
    expect(badProvider.status).toBe(400);

    const badThreshold = await PATCH({ json: async () => ({ jevConfidenceThreshold: 5 }) });
    expect(badThreshold.status).toBe(400);
  });
});

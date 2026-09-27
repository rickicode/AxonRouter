import { describe, it, expect, vi } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { REGISTRY_UI } from "../../open-sse/providers/registry/ui.js";
import { PROVIDER_MODELS, PROVIDERS } from "../../open-sse/providers/index.js";
import {
  JEV_MODEL_CHOICES,
  DEFAULT_JEV_MODEL,
  jevEndpointForModel,
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

describe("typesafe provider registry entry", () => {
  const entry = REGISTRY.find((r) => r.id === "typesafe");

  it("is registered in the server registry", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("apikey");
    expect(entry.display.name).toBe("TypeSafe AI (Jev)");
    expect(entry.display.notice.apiKeyUrl).toBe("https://console.typesafe.ai");
    expect(entry.transport.baseUrl).toBe("https://api.typesafe.ai/v1");
    expect(entry.transport.validateUrl).toBe("https://api.typesafe.ai/v1/models");
    expect(entry.models).toEqual([{ id: "jev-latest", name: "Jev Latest (System One)" }]);
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
  it("offers the three picker options with the endpoint derived from the model", () => {
    expect(JEV_MODEL_CHOICES.map((c) => c.value)).toEqual([
      "jev-1.13-free",
      "jev-1.13",
      "jev-latest",
    ]);
    expect(jevEndpointForModel("jev-1.13-free")).toBe(ZEN_SYSTEMONE_URL);
    expect(jevEndpointForModel("jev-1.13")).toBe(ZEN_SYSTEMONE_URL);
    expect(jevEndpointForModel("jev-latest")).toBe(TYPESAFE_SYSTEMONE_URL);
    expect(jevEndpointForModel("unknown-model")).toBeNull();
  });

  it("defaults settings.jevModel to the free Zen model", () => {
    const settings = mergeWithDefaults({});
    expect(settings.jevModel).toBe("jev-1.13-free");
  });

  it("PATCH validates jevModel against the allowed models", async () => {
    const { PATCH } = await import("../../src/app/api/settings/route.js");

    const bad = await PATCH({ json: async () => ({ jevModel: "gpt-6" }) });
    expect(bad.status).toBe(400);

    const good = await PATCH({ json: async () => ({ jevModel: "jev-latest" }) });
    expect(good.status).toBe(200);
    expect(mockState.saved.jevModel).toBe("jev-latest");
  });
});

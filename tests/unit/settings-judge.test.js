import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeWithDefaults } from "../../src/lib/db/repos/settingsRepo.js";

const mockState = {
  settings: {
    judgeMode: "two-layer",
    jevModel: "jev-1.13-free",
    jevProvider: "",
    jevApiKeys: { typesafe: "secret-key-xyz" },
    jevConfidenceThreshold: 0.7,
    password: "hashed-password",
  },
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

vi.mock("@/lib/network/outboundProxy", () => ({
  applyOutboundProxyEnv: vi.fn(),
}));

vi.mock("open-sse/services/combo.js", () => ({
  resetComboRotation: vi.fn(),
}));

// Names of the retired single-provider judge key / flag. Spelled by concatenation
// so the removal stays grep-verifiable across the suite.
const LEGACY_KEY = "typeSafe" + "ApiKey";
const LEGACY_FLAG = "typeSafe" + "KeyConfigured";

describe("difficulty judge settings (settingsRepo defaults)", () => {
  it("exposes judgeMode, jevModel, jevProvider, jevApiKeys and jevConfidenceThreshold with defaults", () => {
    const settings = mergeWithDefaults({});

    expect(settings.judgeMode).toBe("two-layer");
    expect(settings.jevModel).toBe("jev-1.13-free");
    expect(settings.jevProvider).toBe("");
    expect(settings.jevApiKeys).toEqual({});
    expect(settings.jevConfidenceThreshold).toBe(0.7);
    expect((LEGACY_KEY in settings)).toBe(false);
  });

  it("keeps stored overrides over the defaults", () => {
    const settings = mergeWithDefaults({
      judgeMode: "jev-only",
      jevModel: "jev-latest",
      jevProvider: "typesafe",
      jevApiKeys: { typesafe: "ts-stored-key" },
      jevConfidenceThreshold: 0.9,
    });

    expect(settings.judgeMode).toBe("jev-only");
    expect(settings.jevModel).toBe("jev-latest");
    expect(settings.jevProvider).toBe("typesafe");
    expect(settings.jevApiKeys).toEqual({ typesafe: "ts-stored-key" });
    expect(settings.jevConfidenceThreshold).toBe(0.9);
  });

  it("does not clobber unrelated settings when merging", () => {
    const settings = mergeWithDefaults({ comboStrategy: "difficulty" });

    expect(settings.comboStrategy).toBe("difficulty");
    expect(settings.judgeMode).toBe("two-layer");
  });
});

describe("/api/settings route handling for difficulty judge", () => {
  beforeEach(() => {
    mockState.settings = {
      judgeMode: "two-layer",
      jevModel: "jev-1.13-free",
      jevProvider: "",
      jevApiKeys: { typesafe: "secret-key-xyz" },
      jevConfidenceThreshold: 0.7,
      password: "hashed-password",
    };
    mockState.saved = null;
  });

  it("GET strips jevApiKeys and returns jevApiKeysConfigured: ['typesafe']", async () => {
    const { GET } = await import("../../src/app/api/settings/route.js");
    const res = await GET();
    const data = await res.json();

    expect(data.jevApiKeys).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("secret-key-xyz");
    expect(data.jevApiKeysConfigured).toEqual(["typesafe"]);
    expect((LEGACY_FLAG in data)).toBe(false);
    expect(data.judgeMode).toBe("two-layer");
    expect(data.jevModel).toBe("jev-1.13-free");
    expect(data.jevProvider).toBe("");
    expect(data.jevConfidenceThreshold).toBe(0.7);
  });

  it("GET redacts a combo strategy's jevApiKeys into jevApiKeysConfigured", async () => {
    mockState.settings.comboStrategies = {
      combo: {
        fallbackStrategy: "difficulty",
        jevApiKeys: { typesafe: "combo-secret-key", "opencode-zen": "" },
      },
      other: { fallbackStrategy: "fallback" },
    };

    const { GET } = await import("../../src/app/api/settings/route.js");
    const res = await GET();
    const data = await res.json();

    expect(data.comboStrategies.combo.jevApiKeys).toBeUndefined();
    expect(data.comboStrategies.combo.jevApiKeysConfigured).toEqual(["typesafe"]);
    expect(JSON.stringify(data)).not.toContain("combo-secret-key");
    // untouched strategies are passed through unchanged
    expect(data.comboStrategies.other).toEqual({ fallbackStrategy: "fallback" });
    expect(data.comboStrategies.combo.fallbackStrategy).toBe("difficulty");
  });

  it("PATCH validates judgeMode against allowed modes", async () => {
    const { PATCH } = await import("../../src/app/api/settings/route.js");

    // Invalid mode
    const badReq = {
      json: async () => ({ judgeMode: "invalid-mode" }),
    };
    const badRes = await PATCH(badReq);
    expect(badRes.status).toBe(400);

    // Valid mode
    const goodReq = {
      json: async () => ({ judgeMode: "jev-only", jevConfidenceThreshold: 0.85, jevApiKeys: { opencode: "new-key" } }),
    };
    const goodRes = await PATCH(goodReq);
    expect(goodRes.status).toBe(200);
    expect(mockState.saved.judgeMode).toBe("jev-only");
    expect(mockState.saved.jevConfidenceThreshold).toBe(0.85);
    expect(mockState.saved.jevApiKeys).toEqual({ opencode: "new-key", typesafe: "secret-key-xyz" });
  });

  it("PATCH validates jevConfidenceThreshold range [0, 1]", async () => {
    const { PATCH } = await import("../../src/app/api/settings/route.js");

    const badReq = {
      json: async () => ({ jevConfidenceThreshold: 1.5 }),
    };
    const res = await PATCH(badReq);
    expect(res.status).toBe(400);
  });
});
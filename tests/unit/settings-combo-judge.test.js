import { describe, it, expect, vi, beforeEach } from "vitest";

// The dashboard never receives a classifier provider key (global or per combo), so every
// write it performs must keep the stored keys intact unless it explicitly clears one.
const mockState = {
  settings: null,
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

function baseSettings() {
  return {
    judgeMode: "two-layer",
    jevApiKeys: { typesafe: "global-secret" },
    jevConfidenceThreshold: 0.7,
    password: "hashed-password",
    comboStrategies: {
      alpha: {
        fallbackStrategy: "difficulty",
        judgeMode: "jev-only",
        jevApiKeys: { typesafe: "combo-secret" },
      },
      beta: {
        fallbackStrategy: "difficulty",
        judgeMode: "llm-only",
      },
    },
  };
}

describe("combo-level classifier provider keys in /api/settings", () => {
  beforeEach(() => {
    mockState.settings = baseSettings();
    mockState.saved = null;
  });

  it("GET redacts every combo-level key and reports which providers are configured", async () => {
    const { GET } = await import("../../src/app/api/settings/route.js");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(JSON.stringify(data)).not.toContain("combo-secret");
    expect(data.comboStrategies.alpha.jevApiKeys).toBeUndefined();
    expect(data.comboStrategies.alpha.jevApiKeysConfigured).toEqual(["typesafe"]);
    expect(data.comboStrategies.alpha.judgeMode).toBe("jev-only");
    expect(data.comboStrategies.beta.jevApiKeysConfigured).toBeUndefined();
    expect(data.comboStrategies.beta.judgeMode).toBe("llm-only");
    // The single-key fields are gone everywhere, global scope included.
    const legacyKey = "typeSafe" + "ApiKey";
    const legacyFlag = "typeSafe" + "KeyConfigured";
    expect(JSON.stringify(data)).not.toContain(legacyKey);
    expect(JSON.stringify(data)).not.toContain(legacyFlag);
    expect(data.jevApiKeys).toBeUndefined();
    expect(data.jevApiKeysConfigured).toEqual(["typesafe"]);
  });

  it("PATCH keeps a stored combo key when the payload omits it", async () => {
    const { PATCH } = await import("../../src/app/api/settings/route.js");

    // What the browser can post: the redacted view plus its own edits.
    const clientView = {
      alpha: {
        fallbackStrategy: "difficulty",
        judgeMode: "two-layer",
        jevApiKeysConfigured: ["typesafe"],
      },
      beta: { fallbackStrategy: "difficulty", judgeMode: "llm-only" },
    };
    const res = await PATCH({ json: async () => ({ comboStrategies: clientView }) });

    expect(res.status).toBe(200);
    expect(mockState.settings.comboStrategies.alpha.jevApiKeys).toEqual({ typesafe: "combo-secret" });
    expect(mockState.settings.comboStrategies.alpha.judgeMode).toBe("two-layer");
    expect(mockState.settings.comboStrategies.alpha.jevApiKeysConfigured).toBeUndefined();
    expect(mockState.settings.comboStrategies.beta.jevApiKeys).toBeUndefined();

    const data = await res.json();
    expect(JSON.stringify(data)).not.toContain("combo-secret");
    expect(data.comboStrategies.alpha.jevApiKeysConfigured).toEqual(["typesafe"]);
  });

  it("PATCH clears a combo key only when the client sends an empty string", async () => {
    const { PATCH } = await import("../../src/app/api/settings/route.js");

    const clientView = {
      alpha: {
        fallbackStrategy: "difficulty",
        jevApiKeys: { typesafe: "" },
        jevApiKeysConfigured: ["typesafe"],
      },
      beta: { fallbackStrategy: "difficulty", judgeMode: "llm-only" },
    };
    const res = await PATCH({ json: async () => ({ comboStrategies: clientView }) });

    expect(res.status).toBe(200);
    expect(mockState.settings.comboStrategies.alpha.jevApiKeys).toBeUndefined();
    expect(mockState.settings.comboStrategies.alpha.jevApiKeysConfigured).toBeUndefined();
    expect(mockState.settings.comboStrategies.beta.jevApiKeys).toBeUndefined();

    const data = await res.json();
    expect(data.comboStrategies.alpha.jevApiKeysConfigured).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("combo-secret");
  });

  it("PATCH trims and stores a newly supplied combo key", async () => {
    const { PATCH } = await import("../../src/app/api/settings/route.js");

    const clientView = {
      alpha: { fallbackStrategy: "difficulty", judgeMode: "jev-only" },
      beta: { fallbackStrategy: "difficulty", jevApiKeys: { typesafe: "  beta-secret  " } },
    };
    const res = await PATCH({ json: async () => ({ comboStrategies: clientView }) });

    expect(res.status).toBe(200);
    expect(mockState.settings.comboStrategies.alpha.jevApiKeys).toEqual({ typesafe: "combo-secret" });
    expect(mockState.settings.comboStrategies.beta.jevApiKeys).toEqual({ typesafe: "beta-secret" });

    const data = await res.json();
    expect(JSON.stringify(data)).not.toContain("beta-secret");
    expect(data.comboStrategies.beta.jevApiKeysConfigured).toEqual(["typesafe"]);
  });
});

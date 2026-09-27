import { describe, it, expect, vi, beforeEach } from "vitest";

// The dashboard never receives a TypeSafe key (global or per combo), so every write it
// performs must keep the stored key intact unless it explicitly clears it.
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
    typeSafeApiKey: "global-secret",
    jevConfidenceThreshold: 0.7,
    password: "hashed-password",
    comboStrategies: {
      alpha: {
        fallbackStrategy: "difficulty",
        judgeMode: "jev-only",
        typeSafeApiKey: "combo-secret",
      },
      beta: {
        fallbackStrategy: "difficulty",
        judgeMode: "llm-only",
      },
    },
  };
}

describe("combo-level TypeSafe key in /api/settings", () => {
  beforeEach(() => {
    mockState.settings = baseSettings();
    mockState.saved = null;
  });

  it("GET redacts every combo-level key and reports its presence only", async () => {
    const { GET } = await import("../../src/app/api/settings/route.js");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(JSON.stringify(data)).not.toContain("combo-secret");
    expect(data.comboStrategies.alpha.typeSafeApiKey).toBeUndefined();
    expect(data.comboStrategies.alpha.typeSafeKeyConfigured).toBe(true);
    expect(data.comboStrategies.alpha.judgeMode).toBe("jev-only");
    expect(data.comboStrategies.beta.typeSafeKeyConfigured).toBeUndefined();
    expect(data.comboStrategies.beta.judgeMode).toBe("llm-only");
  });

  it("PATCH keeps a stored combo key when the payload omits it", async () => {
    const { PATCH } = await import("../../src/app/api/settings/route.js");

    // What the browser can post: the redacted view plus its own edits.
    const clientView = {
      alpha: { fallbackStrategy: "difficulty", judgeMode: "two-layer", typeSafeKeyConfigured: true },
      beta: { fallbackStrategy: "difficulty", judgeMode: "llm-only" },
    };
    const res = await PATCH({ json: async () => ({ comboStrategies: clientView }) });

    expect(res.status).toBe(200);
    expect(mockState.settings.comboStrategies.alpha.typeSafeApiKey).toBe("combo-secret");
    expect(mockState.settings.comboStrategies.alpha.judgeMode).toBe("two-layer");
    expect(mockState.settings.comboStrategies.alpha.typeSafeKeyConfigured).toBeUndefined();
    expect(mockState.settings.comboStrategies.beta.typeSafeApiKey).toBeUndefined();

    const data = await res.json();
    expect(JSON.stringify(data)).not.toContain("combo-secret");
    expect(data.comboStrategies.alpha.typeSafeKeyConfigured).toBe(true);
  });

  it("PATCH clears a combo key only when the client sends an empty string", async () => {
    const { PATCH } = await import("../../src/app/api/settings/route.js");

    const clientView = {
      alpha: { fallbackStrategy: "difficulty", typeSafeApiKey: "", typeSafeKeyConfigured: false },
      beta: { fallbackStrategy: "difficulty", judgeMode: "llm-only" },
    };
    const res = await PATCH({ json: async () => ({ comboStrategies: clientView }) });

    expect(res.status).toBe(200);
    expect(mockState.settings.comboStrategies.alpha.typeSafeApiKey).toBeUndefined();
    expect(mockState.settings.comboStrategies.alpha.typeSafeKeyConfigured).toBeUndefined();
    expect(mockState.settings.comboStrategies.beta.typeSafeApiKey).toBeUndefined();

    const data = await res.json();
    expect(data.comboStrategies.alpha.typeSafeKeyConfigured).toBeUndefined();
  });

  it("PATCH trims and stores a newly supplied combo key", async () => {
    const { PATCH } = await import("../../src/app/api/settings/route.js");

    const clientView = {
      alpha: { fallbackStrategy: "difficulty", judgeMode: "jev-only" },
      beta: { fallbackStrategy: "difficulty", typeSafeApiKey: "  beta-secret  " },
    };
    const res = await PATCH({ json: async () => ({ comboStrategies: clientView }) });

    expect(res.status).toBe(200);
    expect(mockState.settings.comboStrategies.alpha.typeSafeApiKey).toBe("combo-secret");
    expect(mockState.settings.comboStrategies.beta.typeSafeApiKey).toBe("beta-secret");

    const data = await res.json();
    expect(JSON.stringify(data)).not.toContain("beta-secret");
    expect(data.comboStrategies.beta.typeSafeKeyConfigured).toBe(true);
  });
});

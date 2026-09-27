import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeWithDefaults } from "../../src/lib/db/repos/settingsRepo.js";

const mockState = {
  settings: {
    judgeMode: "two-layer",
    typeSafeApiKey: "secret-key-xyz",
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

describe("difficulty judge settings (settingsRepo defaults)", () => {
  it("exposes judgeMode, typeSafeApiKey and jevConfidenceThreshold with defaults", () => {
    const settings = mergeWithDefaults({});

    expect(settings.judgeMode).toBe("two-layer");
    expect(settings.typeSafeApiKey).toBe("");
    expect(settings.jevConfidenceThreshold).toBe(0.7);
  });

  it("keeps stored overrides over the defaults", () => {
    const settings = mergeWithDefaults({
      judgeMode: "jev-only",
      typeSafeApiKey: "ts-stored-key",
      jevConfidenceThreshold: 0.9,
    });

    expect(settings.judgeMode).toBe("jev-only");
    expect(settings.typeSafeApiKey).toBe("ts-stored-key");
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
      typeSafeApiKey: "secret-key-xyz",
      jevConfidenceThreshold: 0.7,
      password: "hashed-password",
    };
    mockState.saved = null;
  });

  it("GET strips typeSafeApiKey and returns typeSafeKeyConfigured: true", async () => {
    const { GET } = await import("../../src/app/api/settings/route.js");
    const res = await GET();
    const data = await res.json();

    expect(data.typeSafeApiKey).toBeUndefined();
    expect(data.typeSafeKeyConfigured).toBe(true);
    expect(data.judgeMode).toBe("two-layer");
    expect(data.jevConfidenceThreshold).toBe(0.7);
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
      json: async () => ({ judgeMode: "jev-only", jevConfidenceThreshold: 0.85, typeSafeApiKey: "new-key" }),
    };
    const goodRes = await PATCH(goodReq);
    expect(goodRes.status).toBe(200);
    expect(mockState.saved.judgeMode).toBe("jev-only");
    expect(mockState.saved.jevConfidenceThreshold).toBe(0.85);
    expect(mockState.saved.typeSafeApiKey).toBe("new-key");
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

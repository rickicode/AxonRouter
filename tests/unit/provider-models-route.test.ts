import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderConnectionById = vi.fn();
const getModelsByProviderId = vi.fn();

vi.mock("@/models", () => ({
  getProviderConnectionById,
}));

vi.mock("@/shared/constants/providers", () => ({
  AI_PROVIDERS: {},
  OAUTH_PROVIDERS: {},
  APIKEY_PROVIDERS: { assemblyai: {}, nvidia: {} },
  FREE_PROVIDERS: {},
  FREE_TIER_PROVIDERS: {},
  WEB_COOKIE_PROVIDERS: {},
  isOpenAICompatibleProvider: vi.fn(() => false),
  isAnthropicCompatibleProvider: vi.fn(() => false),
  isMorphManagedProvider: vi.fn(() => false),
  MORPH_MANAGED_PROVIDER_ID: "morph-fast",
}));

vi.mock("@/lib/oauth/services/kiro", () => ({
  KiroService: class {},
}));

vi.mock("@/lib/oauth/constants/oauth", () => ({
  GEMINI_CONFIG: { clientId: "x", clientSecret: "y" },
}));

vi.mock("@/sse/services/tokenRefresh", () => ({
  refreshGoogleToken: vi.fn(),
  updateProviderCredentials: vi.fn(),
  refreshKiroToken: vi.fn(),
}));

vi.mock("open-sse/config/providerModels.ts", () => ({
  getModelsByProviderId,
  PROVIDER_ID_TO_ALIAS: {},
  PROVIDER_MODELS: {},
}));

vi.mock("open-sse/config/providers.ts", () => ({
  resolveOllamaLocalHost: vi.fn(() => "http://localhost:11434"),
}));

describe("/api/providers/[id]/models route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("falls back to curated static models for STT providers when live fetch fails", async () => {
    getProviderConnectionById.mockResolvedValue({
      id: "conn-1",
      provider: "assemblyai",
      apiKey: "aai-key",
      providerSpecificData: {},
    });
    getModelsByProviderId.mockReturnValue([
      { id: "universal-3-pro", name: "Universal 3 Pro", type: "stt" },
      { id: "universal-2", name: "Universal 2", type: "stt" },
    ]);
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    });

    const { GET } = await import("../../src/app/api/providers/[id]/models/route.ts");
    const response = await GET(new Request("http://localhost/api/providers/conn-1/models"), {
      params: Promise.resolve({ id: "conn-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toEqual([
      { id: "universal-3-pro", name: "Universal 3 Pro", type: "stt", source: "system" },
      { id: "universal-2", name: "Universal 2", type: "stt", source: "system" },
    ]);
    expect(body.warning).toMatch(/Using aggregate fallback models/);
  });

  it("uses curated static models when provider returns empty live model list", async () => {
    getProviderConnectionById.mockResolvedValue({
      id: "conn-2",
      provider: "nvidia",
      apiKey: "nv-key",
      providerSpecificData: {},
    });
    getModelsByProviderId.mockReturnValue([
      { id: "nvidia/parakeet-ctc-1.1b-asr", name: "Parakeet CTC 1.1B", type: "stt" },
    ]);
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { GET } = await import("../../src/app/api/providers/[id]/models/route.ts");
    const response = await GET(new Request("http://localhost/api/providers/conn-2/models"), {
      params: Promise.resolve({ id: "conn-2" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toEqual([
      { id: "nvidia/parakeet-ctc-1.1b-asr", name: "Parakeet CTC 1.1B", type: "stt", source: "system" },
    ]);
    expect(body.warning).toMatch(/returned no live models/i);
  });
});

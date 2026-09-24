import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnectionById: vi.fn(),
  updateProviderConnection: vi.fn(),
  getUsageForProvider: vi.fn(),
  upsertUsageSnapshot: vi.fn(),
  publishEvent: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: mocks.getProviderConnectionById,
  updateProviderConnection: mocks.updateProviderConnection,
}));
vi.mock("open-sse/services/usage.js", () => ({
  getUsageForProvider: mocks.getUsageForProvider,
}));
vi.mock("open-sse/executors/index.js", () => ({
  getExecutor: () => ({ needsRefresh: () => false }),
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/shared/constants/providers", () => ({
  USAGE_APIKEY_PROVIDERS: [],
}));
vi.mock("@/lib/db/repos/usageSnapshotsRepo.js", () => ({
  upsertUsageSnapshot: (...args) => (mocks.upsertUsageSnapshot(...args), Promise.resolve()),
}));
vi.mock("@/lib/cache/client.js", () => ({
  publishEvent: (...args) => (mocks.publishEvent(...args), Promise.resolve()),
}));

const { GET } = await import("../../src/app/api/usage/[connectionId]/route.js");

function request() {
  return { url: "http://localhost/api/usage/ag-1" };
}

describe("GET /api/usage/[connectionId] quota auth-expired handling", () => {
  it("disables connection on persistent Antigravity quota 401", async () => {
    const fresh = {
      id: "ag-1", provider: "antigravity", authType: "oauth",
      accessToken: "tok", refreshToken: null,
    };
    const disabled = { ...fresh, isActive: false, testStatus: "disabled" };
    mocks.getProviderConnectionById
      .mockResolvedValueOnce(fresh)
      .mockResolvedValueOnce(disabled);
    mocks.getUsageForProvider.mockResolvedValue({
      message: "Antigravity quota API authentication expired. Chat may still work.",
      quotas: {},
    });
    mocks.updateProviderConnection.mockResolvedValue(disabled);

    const res = await GET(request(), { params: Promise.resolve({ connectionId: "ag-1" }) });
    expect(res.status).toBe(200);
    expect(mocks.updateProviderConnection).toHaveBeenCalledWith(
      "ag-1",
      expect.objectContaining({ isActive: false, testStatus: "disabled", errorCode: 401 }),
    );
  });
});

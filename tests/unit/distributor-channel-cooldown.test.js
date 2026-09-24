import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getProviderConnectionById: vi.fn(async () => null),
  getProviderConnections: vi.fn(),
  updateProviderConnection: vi.fn(async () => {}),
  getUsageSnapshotByConnectionId: vi.fn(async () => null),
  getBatchProviderQuotas: vi.fn(async () => []),
}));

vi.mock("@/lib/localDb", () => dbMocks);
vi.mock("@/lib/network/connectionProxy", () => ({
  pickProxyPoolId: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(),
}));
vi.mock("@/shared/constants/providers.js", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (provider) => provider,
}));
vi.mock("@/sse/utils/logger.js", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock("open-sse/services/usage/google.js", () => ({ getAntigravityUsage: vi.fn() }));

const { markAccountUnavailable } = await import("../../src/sse/services/auth.js");

const CHANNEL_ERROR =
  "No available channel for model gemini-3.5-flash under group gemini (distributor) (request id: abc)";

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getProviderConnections.mockResolvedValue([{
    id: "uk-1", provider: "unikey", name: "uk-1", backoffLevel: 3, testStatus: "active",
  }]);
});

describe("distributor no-available-channel", () => {
  it("locks the model with a stable cooldown and keeps the account usable", async () => {
    const { shouldFallback } = await markAccountUnavailable(
      "uk-1", 503, CHANNEL_ERROR, "unikey", "gemini-3.5-flash");
    expect(shouldFallback).toBe(true);
    expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith(
      "uk-1",
      expect.objectContaining({
        testStatus: "active",
        errorCode: 503,
        backoffLevel: 0,
      }),
    );
    const patch = dbMocks.updateProviderConnection.mock.calls[0][1];
    // Model-scoped lock, never account-wide, never disabled.
    expect(patch).toHaveProperty("modelLock_gemini-3.5-flash");
    expect(patch).not.toHaveProperty("modelLock___all");
    expect(patch.testStatus).not.toBe("disabled");
    // Stable cooldown (30m default), not a seconds-long transient retry.
    const lockMs = Date.parse(patch["modelLock_gemini-3.5-flash"]) - Date.now();
    expect(lockMs).toBeGreaterThan(25 * 60 * 1000);
  });
});

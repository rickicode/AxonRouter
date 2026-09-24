/**
 * Background refresh must DELETE connections whose refresh token is
 * unrecoverable (e.g. "Account has been deleted" / access_denied) —
 * a tombstone row is never revived (re-auth creates a fresh connection),
 * so keeping it just accumulates dead entries.
 *
 * Exercises the real refreshOne path: dynamic imports inside
 * backgroundTokenRefresh.js are intercepted via doMock on the same specifiers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const NOW = Date.parse("2026-09-07T12:00:00.000Z");

vi.mock("@/lib/cache/client.js", () => ({
  acquireLock: vi.fn(async () => true),
  releaseLock: vi.fn(async () => {}),
}));
vi.mock("open-sse/services/tokenRefresh.js", () => ({
  getRefreshLeadMs: () => 5 * 60 * 1000,
}));
vi.mock("open-sse/services/oauthCredentialManager.js", async () => {
  const actual = await vi.importActual("open-sse/services/oauthCredentialManager.js");
  return {
    ...actual,
    getCredentialExpiryMs: (credentials) => {
      if (credentials?.expiresAt == null) return null;
      const ms = new Date(credentials.expiresAt).getTime();
      return Number.isFinite(ms) ? ms : null;
    },
  };
});

describe("refreshOne unrecoverable refresh error deletes connection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("DELETES the connection on unrecoverable refreshError", async () => {
    const checkAndRefreshToken = vi.fn(async () => ({
      refreshError: "Account has been deleted",
      refreshErrorAt: new Date(NOW).toISOString(),
    }));
    const deleteProviderConnection = vi.fn(async () => true);
    const updateProviderConnection = vi.fn(async () => true);

    vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
      checkAndRefreshToken,
    }));
    vi.doMock("../../src/lib/db/repos/connectionsRepo.js", () => ({
      getProviderConnections: vi.fn(async () => []),
      updateProviderConnection,
      deleteProviderConnection,
    }));

    const { runBackgroundTokenRefreshTick } = await import(
      "../../src/sse/services/backgroundTokenRefresh.js"
    );

    const due = {
      id: "ag-1",
      provider: "antigravity",
      authType: "oauth",
      refreshToken: "rt-dead",
      expiresAt: new Date(NOW - 60 * 1000).toISOString(),
      providerSpecificData: {},
    };

    await runBackgroundTokenRefreshTick({
      loadConnections: async () => [due],
      sleep: async () => {},
    });

    expect(checkAndRefreshToken).toHaveBeenCalledTimes(1);
    expect(deleteProviderConnection).toHaveBeenCalledWith("ag-1");
    // No tombstone patch on the happy delete path.
    expect(updateProviderConnection).not.toHaveBeenCalled();
  });

  it("falls back to marking inactive when delete races (returns false)", async () => {
    const checkAndRefreshToken = vi.fn(async () => ({
      refreshError: "Account has been deleted",
      refreshErrorAt: new Date(NOW).toISOString(),
    }));
    const deleteProviderConnection = vi.fn(async () => false);
    const updateProviderConnection = vi.fn(async () => true);

    vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
      checkAndRefreshToken,
    }));
    vi.doMock("../../src/lib/db/repos/connectionsRepo.js", () => ({
      getProviderConnections: vi.fn(async () => []),
      updateProviderConnection,
      deleteProviderConnection,
    }));

    const { runBackgroundTokenRefreshTick } = await import(
      "../../src/sse/services/backgroundTokenRefresh.js"
    );

    const due = {
      id: "ag-1b",
      provider: "antigravity",
      authType: "oauth",
      refreshToken: "rt-dead",
      expiresAt: new Date(NOW - 60 * 1000).toISOString(),
      providerSpecificData: {},
    };

    await runBackgroundTokenRefreshTick({
      loadConnections: async () => [due],
      sleep: async () => {},
    });

    expect(deleteProviderConnection).toHaveBeenCalledWith("ag-1b");
    expect(updateProviderConnection).toHaveBeenCalledWith(
      "ag-1b",
      expect.objectContaining({ isActive: false })
    );
  });

  it("does NOT delete when refresh succeeds", async () => {
    const checkAndRefreshToken = vi.fn(async () => ({
      accessToken: "new-tok",
    }));
    const deleteProviderConnection = vi.fn(async () => true);
    const updateProviderConnection = vi.fn(async () => true);

    vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
      checkAndRefreshToken,
    }));
    vi.doMock("../../src/lib/db/repos/connectionsRepo.js", () => ({
      getProviderConnections: vi.fn(async () => []),
      updateProviderConnection,
      deleteProviderConnection,
    }));

    const { runBackgroundTokenRefreshTick } = await import(
      "../../src/sse/services/backgroundTokenRefresh.js"
    );

    const due = {
      id: "ag-2",
      provider: "antigravity",
      authType: "oauth",
      refreshToken: "rt-ok",
      expiresAt: new Date(NOW - 60 * 1000).toISOString(),
      providerSpecificData: {},
    };

    await runBackgroundTokenRefreshTick({
      loadConnections: async () => [due],
      sleep: async () => {},
    });

    expect(checkAndRefreshToken).toHaveBeenCalledTimes(1);
    expect(deleteProviderConnection).not.toHaveBeenCalled();
    expect(updateProviderConnection).not.toHaveBeenCalled();
  });

  it("keeps access-token-still-valid connections active (no delete)", async () => {
    const checkAndRefreshToken = vi.fn(async () => ({
      refreshError: "temporarily_unavailable",
      refreshErrorAt: new Date(NOW).toISOString(),
    }));
    const deleteProviderConnection = vi.fn(async () => true);
    const updateProviderConnection = vi.fn(async () => true);

    vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
      checkAndRefreshToken,
    }));
    vi.doMock("../../src/lib/db/repos/connectionsRepo.js", () => ({
      getProviderConnections: vi.fn(async () => []),
      updateProviderConnection,
      deleteProviderConnection,
    }));

    const { runBackgroundTokenRefreshTick } = await import(
      "../../src/sse/services/backgroundTokenRefresh.js"
    );

    const due = {
      id: "ag-3",
      provider: "antigravity",
      authType: "oauth",
      refreshToken: "rt-ok",
      // Access token still valid for 10 minutes — must NOT be touched.
      expiresAt: new Date(NOW + 10 * 60 * 1000).toISOString(),
      providerSpecificData: {},
    };

    await runBackgroundTokenRefreshTick({
      loadConnections: async () => [due],
      sleep: async () => {},
    });

    expect(deleteProviderConnection).not.toHaveBeenCalled();
    expect(updateProviderConnection).not.toHaveBeenCalled();
  });
});

describe("tombstone sweep deletes legacy dead grants", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("deletes inactive rows with expired tokens each tick", async () => {
    const deleteProviderConnectionsByIds = vi.fn(async () => 2);
    vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
      checkAndRefreshToken: vi.fn(async () => ({})),
    }));
    vi.doMock("../../src/lib/db/repos/connectionsRepo.js", () => ({
      getProviderConnections: vi.fn(async (filter) =>
        filter.isActive === false ? [
          { id: "dead-1", provider: "grok-cli", expiresAt: new Date(NOW - 60 * 1000).toISOString() },
          { id: "dead-2", provider: "kiro", expiresAt: new Date(NOW - 3600 * 1000).toISOString() },
        ] : []),
      deleteProviderConnectionsByIds,
    }));

    const { runBackgroundTokenRefreshTick } = await import(
      "../../src/sse/services/backgroundTokenRefresh.js"
    );

    await runBackgroundTokenRefreshTick({
      loadConnections: undefined, // force real loadActiveConnections
      refreshConnection: vi.fn(async () => null),
      sleep: async () => {},
    });

    expect(deleteProviderConnectionsByIds).toHaveBeenCalledWith(["dead-1", "dead-2"]);
  });

  it("keeps inactive rows whose token is not expired (e.g. fresh tombstones)", async () => {
    const deleteProviderConnectionsByIds = vi.fn(async () => 0);
    vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
      checkAndRefreshToken: vi.fn(async () => ({})),
    }));
    vi.doMock("../../src/lib/db/repos/connectionsRepo.js", () => ({
      getProviderConnections: vi.fn(async (filter) =>
        filter.isActive === false ? [
          { id: "keep-1", provider: "kiro", expiresAt: new Date(NOW + 10 * 60 * 1000).toISOString() },
        ] : []),
      deleteProviderConnectionsByIds,
    }));

    const { runBackgroundTokenRefreshTick } = await import(
      "../../src/sse/services/backgroundTokenRefresh.js"
    );

    await runBackgroundTokenRefreshTick({
      refreshConnection: vi.fn(async () => null),
      sleep: async () => {},
    });

    expect(deleteProviderConnectionsByIds).not.toHaveBeenCalled();
  });
});
describe("transient-failure backoff skips re-fire within window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not retry a transiently-failed connection on the next tick", async () => {
    const checkAndRefreshToken = vi.fn(async () => ({
      refreshError: "upstream_timeout",
      refreshErrorAt: new Date(NOW).toISOString(),
    }));
    const deleteProviderConnection = vi.fn(async () => true);
    const updateProviderConnection = vi.fn(async () => true);

    vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
      checkAndRefreshToken,
    }));
    vi.doMock("../../src/lib/db/repos/connectionsRepo.js", () => ({
      getProviderConnections: vi.fn(async () => []),
      updateProviderConnection,
      deleteProviderConnection,
    }));

    const { runBackgroundTokenRefreshTick } = await import(
      "../../src/sse/services/backgroundTokenRefresh.js"
    );

    // Access token still valid → refreshError path keeps it active, and the
    // transient backoff should suppress the next-tick re-fire.
    const due = {
      id: "t-1",
      provider: "antigravity",
      authType: "oauth",
      refreshToken: "rt-t",
      expiresAt: new Date(NOW + 10 * 60 * 1000).toISOString(),
      providerSpecificData: {},
    };

    await runBackgroundTokenRefreshTick({
      loadConnections: async () => [due],
      sleep: async () => {},
    });
    expect(checkAndRefreshToken).toHaveBeenCalledTimes(1);

    // Advance 1 minute (one tick) — still inside the 5-minute backoff window.
    vi.setSystemTime(NOW + 60 * 1000);
    await runBackgroundTokenRefreshTick({
      loadConnections: async () => [due],
      sleep: async () => {},
    });
    expect(checkAndRefreshToken).toHaveBeenCalledTimes(1); // no second fire

    // Advance past the 5-minute base window → retry allowed again.
    vi.setSystemTime(NOW + 6 * 60 * 1000);
    await runBackgroundTokenRefreshTick({
      loadConnections: async () => [due],
      sleep: async () => {},
    });
    expect(checkAndRefreshToken).toHaveBeenCalledTimes(2);
  });
});

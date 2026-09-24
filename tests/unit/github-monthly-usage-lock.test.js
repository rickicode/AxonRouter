import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getProviderConnectionById: vi.fn(async () => null),
  getProviderConnections: vi.fn(),
  updateProviderConnection: vi.fn(),
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

const { markAccountUnavailable } = await import("../../src/sse/services/auth.js");

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getProviderConnections.mockResolvedValue([{
    id: "github-a",
    provider: "github",
    name: "github-a",
    backoffLevel: 4,
  }]);
});

describe("GitHub monthly usage exhaustion", () => {
  it("locks the whole account until the next UTC month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T19:30:00.000Z"));

    try {
      await markAccountUnavailable(
        "github-a",
        402,
        "You've reached your additional usage limit for your plan. Go to GitHub settings for details.",
        "github",
        "claude-fable-5",
      );

      expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith(
        "github-a",
        expect.objectContaining({
          modelLock___all: "2026-09-01T00:00:00.000Z",
          testStatus: "unavailable",
          errorCode: 402,
          backoffLevel: 0,
        }),
      );
      expect(dbMocks.updateProviderConnection.mock.calls[0][1])
        .not.toHaveProperty("modelLock_claude-fable-5");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps unrelated GitHub 402 errors model-scoped", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T19:30:00.000Z"));

    try {
      await markAccountUnavailable(
        "github-a",
        402,
        "Payment required",
        "github",
        "claude-fable-5",
      );

      expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith(
        "github-a",
        expect.objectContaining({
          "modelLock_claude-fable-5": "2026-08-04T19:32:00.000Z",
        }),
      );
      expect(dbMocks.updateProviderConnection.mock.calls[0][1])
        .not.toHaveProperty("modelLock___all");
    } finally {
      vi.useRealTimers();
    }
  });

  it("locks Antigravity per-model on 429 quota exhaustion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T19:30:00.000Z"));

    dbMocks.getProviderConnections.mockResolvedValueOnce([{
      id: "antigravity-1",
      provider: "antigravity",
      name: "antigravity-1",
      backoffLevel: 0,
      testStatus: "active",
    }]);

    try {
      await markAccountUnavailable(
        "antigravity-1",
        429,
        "Resource exhausted: quota exceeded",
        "antigravity",
        "claude-sonnet-4.5",
      );

      expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith(
        "antigravity-1",
        expect.objectContaining({
          "modelLock_claude-sonnet-4.5": expect.any(String),
          testStatus: "active",
        }),
      );
      expect(dbMocks.updateProviderConnection.mock.calls[0][1])
        .not.toHaveProperty("modelLock___all");
    } finally {
      vi.useRealTimers();
    }
  });

  it("locks Codex account-wide on 429 quota exhaustion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T19:30:00.000Z"));

    dbMocks.getProviderConnections.mockResolvedValueOnce([{
      id: "codex-1",
      provider: "codex",
      name: "codex-1",
      backoffLevel: 0,
      testStatus: "active",
    }]);

    try {
      await markAccountUnavailable(
        "codex-1",
        429,
        "Usage limit reached",
        "codex",
        "gpt-5.6",
      );

      // "Usage limit reached" names no credit/quota depletion — the account
      // still locks account-wide with a timed cooldown, but the durable
      // verdict is "unavailable" (recoverable), never "exhausted".
      // Exhausted is reserved for credits/quota actually gone.
      expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith(
        "codex-1",
        expect.objectContaining({
          modelLock___all: expect.any(String),
          testStatus: "unavailable",
        }),
      );
      expect(dbMocks.updateProviderConnection.mock.calls[0][1])
        .not.toHaveProperty("modelLock_gpt-5.6");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Freebuff banned/country-blocked accounts", () => {
  it("disables a banned Freebuff account (is_active=false, testStatus disabled)", async () => {
    dbMocks.getProviderConnections.mockResolvedValueOnce([{
      id: "fb-1",
      provider: "freebuff",
      name: "fb-1",
      displayName: "Freebuff A",
      backoffLevel: 0,
      testStatus: "active",
    }]);

    const res = await markAccountUnavailable(
      "fb-1",
      403,
      "Freebuff account banned (403): {\"status\":\"banned\"}",
      "freebuff",
      "deepseek/deepseek-v4-flash",
      null,
      "banned",
    );

    expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith(
      "fb-1",
      expect.objectContaining({
        isActive: false,
        testStatus: "disabled",
        errorCode: 403,
        backoffLevel: 0,
        modelLock___all: null,
        rateLimitedUntil: null,
      }),
    );
    expect(res).toEqual({ shouldFallback: true, cooldownMs: 0 });
  });

  it("disables a banned Freebuff account even when freebuffKind is absent (regex fallback)", async () => {
    dbMocks.getProviderConnections.mockResolvedValueOnce([{
      id: "fb-2",
      provider: "freebuff",
      name: "fb-2",
      backoffLevel: 0,
    }]);

    await markAccountUnavailable(
      "fb-2",
      403,
      "Freebuff account banned (403): {\"status\":\"banned\"}",
      "freebuff",
      "openai/gpt-5.6-luna",
      null,
      null,
    );

    expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith(
      "fb-2",
      expect.objectContaining({ isActive: false, testStatus: "disabled", errorCode: 403 }),
    );
  });

  it("never disables a country_blocked Freebuff account (proxy-rotatable, not an account fault)", async () => {
    dbMocks.getProviderConnections.mockResolvedValueOnce([{
      id: "fb-3",
      provider: "freebuff",
      name: "fb-3",
      backoffLevel: 0,
    }]);

    await markAccountUnavailable(
      "fb-3",
      403,
      "Freebuff is not available in your region (country blocked).",
      "freebuff",
      "deepseek/deepseek-v4-flash",
      null,
      "country_blocked",
    );

    const update = dbMocks.updateProviderConnection.mock.calls[0][1];
    expect(update).not.toHaveProperty("isActive");
    expect(update).not.toHaveProperty("modelLock___all");
    expect(update.lastError).toMatch(/country blocked/i);
  });
});

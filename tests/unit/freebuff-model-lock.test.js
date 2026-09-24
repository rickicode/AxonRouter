import { describe, it, expect, beforeEach, vi } from "vitest";

const connectionsDb = new Map();
let settingsDb = {};

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: vi.fn(async () => null),
  getProviderConnections: vi.fn(async ({ provider, isActive } = {}) => {
    let list = Array.from(connectionsDb.values());
    if (provider) list = list.filter((c) => c.provider === provider);
    if (isActive !== undefined) list = list.filter((c) => c.isActive === isActive);
    return list;
  }),
  getSettings: vi.fn(async () => settingsDb),
  updateProviderConnection: vi.fn(async (id, patch) => {
    const existing = connectionsDb.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    connectionsDb.set(id, updated);
    return updated;
  }),
  lockAccountToModel: vi.fn(async (id, model, durationMs = 3600000) => {
    const existing = connectionsDb.get(id);
    if (!existing) return null;
    const until = new Date(Date.now() + durationMs).toISOString();
    const updated = { ...existing, lockedToModel: model, lockedToModelUntil: until };
    connectionsDb.set(id, updated);
    return updated;
  }),
  unlockAccountModel: vi.fn(async (id) => {
    const existing = connectionsDb.get(id);
    if (!existing) return null;
    const updated = { ...existing, lockedToModel: null, lockedToModelUntil: null };
    connectionsDb.set(id, updated);
    return updated;
  }),
  getProxyPools: vi.fn(async () => []),
}));

vi.mock("@/lib/cache/client.js", () => ({
  getCachedConnections: vi.fn(async () => null),
  setCachedConnections: vi.fn(async () => {}),
  getBatchCooldowns: vi.fn(async () => new Set()),
  setAccountCooldown: vi.fn(async () => true),
  setModelCooldown: vi.fn(async () => true),
  invalidateCachedConnections: vi.fn(async () => {}),
  getLkg: vi.fn(async () => null),
  delLkg: vi.fn(async () => true),
  getDeadCircuit: vi.fn(async () => 0),
  incrDeadCircuit: vi.fn(async () => 1),
  resetDeadCircuit: vi.fn(async () => true),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async (psd) => ({
    connectionProxyEnabled: false,
    connectionProxyUrl: "",
    connectionNoProxy: "",
    proxyPoolId: null,
  })),
  pickProxyPoolId: vi.fn(() => null),
}));

import { getProviderCredentials, markAccountUnavailable, clearAvailabilityMemo } from "../../src/sse/services/auth.js";
import { getFreebuffQuotaCache } from "open-sse/services/usage/freebuff.js";

describe("Freebuff 1-Hour Dynamic Model Affinity Lock", () => {
  beforeEach(() => {
    connectionsDb.clear();
    settingsDb = {};
    getFreebuffQuotaCache().clear();
    // Negative-availability memo lives 60s in module state. Without a reset,
    // one test's blocked verdict leaks into the next test for the same pair.
    clearAvailabilityMemo();
    vi.clearAllMocks();
  });

  it("prioritizes an account that is already locked to the requested model", async () => {
    // Account 1: locked to deepseek-v4-flash
    connectionsDb.set("fb-conn-1", {
      id: "fb-conn-1",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 1",
      accessToken: "token-1",
      isActive: true,
      testStatus: "active",
      priority: 2,
      lockedToModel: "deepseek/deepseek-v4-flash",
      lockedToModelUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30m left
    });

    // Account 2: unlocked / clean
    connectionsDb.set("fb-conn-2", {
      id: "fb-conn-2",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 2",
      accessToken: "token-2",
      isActive: true,
      testStatus: "active",
      priority: 1, // Higher priority!
      lockedToModel: null,
      lockedToModelUntil: null,
    });

    // Request for deepseek/deepseek-v4-flash should pick Account 1 (already locked to it)
    // even though Account 2 has higher priority, to avoid burning clean Account 2.
    const creds = await getProviderCredentials("freebuff", null, "deepseek/deepseek-v4-flash");
    expect(creds.connectionId).toBe("fb-conn-1");
  });

  it("picks an unlocked account when no account is locked to the requested model", async () => {
    // Account 1: locked to deepseek-v4-flash
    connectionsDb.set("fb-conn-1", {
      id: "fb-conn-1",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 1",
      accessToken: "token-1",
      isActive: true,
      testStatus: "active",
      lockedToModel: "deepseek/deepseek-v4-flash",
      lockedToModelUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    // Account 2: clean / unlocked
    connectionsDb.set("fb-conn-2", {
      id: "fb-conn-2",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 2",
      accessToken: "token-2",
      isActive: true,
      testStatus: "active",
      lockedToModel: null,
      lockedToModelUntil: null,
    });

    // Request for openai/gpt-5.6-luna must NOT pick Account 1 (locked to deepseek).
    // It must pick Account 2 (clean/unlocked).
    const creds = await getProviderCredentials("freebuff", null, "openai/gpt-5.6-luna");
    expect(creds.connectionId).toBe("fb-conn-2");
  });

  it("excludes accounts locked to other models and returns 503 retry payload when all accounts are locked", async () => {
    // Account 1: locked to deepseek-v4-flash
    connectionsDb.set("fb-conn-1", {
      id: "fb-conn-1",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 1",
      accessToken: "token-1",
      isActive: true,
      testStatus: "active",
      lockedToModel: "deepseek/deepseek-v4-flash",
      lockedToModelUntil: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    });

    // Account 2: locked to minimax/minimax-m3
    connectionsDb.set("fb-conn-2", {
      id: "fb-conn-2",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 2",
      accessToken: "token-2",
      isActive: true,
      testStatus: "active",
      lockedToModel: "minimax/minimax-m3",
      lockedToModelUntil: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    });

    // Request for openai/gpt-5.6-luna has NO matching account and NO clean account
    const creds = await getProviderCredentials("freebuff", null, "openai/gpt-5.6-luna");
    expect(creds.allRateLimited).toBe(true);
    expect(creds.lastErrorCode).toBe("FREEBUFF_MODEL_LOCKED");
    expect(creds.lastError).toContain("locked to other models");
  });

  it("automatically releases model lock after 1 hour (expired lock)", async () => {
    // Account 1: lock expired 5 minutes ago
    connectionsDb.set("fb-conn-1", {
      id: "fb-conn-1",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 1",
      accessToken: "token-1",
      isActive: true,
      testStatus: "active",
      lockedToModel: "deepseek/deepseek-v4-flash",
      lockedToModelUntil: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // EXPIRED
    });

    // Request for a different model (openai/gpt-5.6-luna) can now use Account 1 because lock expired!
    const creds = await getProviderCredentials("freebuff", null, "openai/gpt-5.6-luna");
    expect(creds.connectionId).toBe("fb-conn-1");
  });

  it("disables banned accounts, clears affinity, and excludes them from lock retries", async () => {
    const bannedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    connectionsDb.set("fb-banned", {
      id: "fb-banned",
      provider: "freebuff",
      authType: "oauth",
      name: "Banned Account",
      accessToken: "banned-token",
      isActive: true,
      testStatus: "active",
      lockedToModel: "openai/gpt-5.6-luna",
      lockedToModelUntil: bannedUntil,
      lockedAllUntil: bannedUntil,
      modelLocks: { "openai/gpt-5.6-luna": bannedUntil },
    });

    await markAccountUnavailable(
      "fb-banned",
      403,
      "Freebuff account has been banned (403)",
      "freebuff",
      "openai/gpt-5.6-luna",
      null,
      "banned",
    );

    const banned = connectionsDb.get("fb-banned");
    expect(banned.isActive).toBe(false);
    expect(banned.testStatus).toBe("disabled");
    expect(banned.lockedToModel).toBeNull();
    expect(banned.lockedToModelUntil).toBeNull();
    expect(banned.lockedAllUntil).toBeNull();
    expect(banned.modelLocks).toEqual({});

    connectionsDb.set("fb-active", {
      id: "fb-active",
      provider: "freebuff",
      authType: "oauth",
      name: "Active Account",
      accessToken: "active-token",
      isActive: true,
      testStatus: "active",
      lockedToModel: "deepseek/deepseek-v4-flash",
      lockedToModelUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    const creds = await getProviderCredentials("freebuff", null, "openai/gpt-5.6-luna");
    expect(creds.allRateLimited).toBe(true);
    expect(creds.lastErrorCode).toBe("FREEBUFF_MODEL_LOCKED");
    expect(creds.retryAfter).not.toBe(bannedUntil);
  });

  it("dynamic lock via lockAccountToModel immediately causes subsequent different-model requests to bypass it", async () => {
    connectionsDb.set("fb-1", {
      id: "fb-1",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 1",
      accessToken: "token-1",
      isActive: true,
      testStatus: "active",
      lockedToModel: null,
      lockedToModelUntil: null,
    });
    connectionsDb.set("fb-2", {
      id: "fb-2",
      provider: "freebuff",
      authType: "oauth",
      name: "Account 2",
      accessToken: "token-2",
      isActive: true,
      testStatus: "active",
      lockedToModel: null,
      lockedToModelUntil: null,
    });

    const creds1 = await getProviderCredentials("freebuff", null, "model-A");
    expect(["fb-1", "fb-2"]).toContain(creds1.connectionId);

    const { lockAccountToModel } = await import("@/lib/localDb");
    await lockAccountToModel("fb-1", "model-A", 3600000);

    const creds2 = await getProviderCredentials("freebuff", null, "model-B");
    expect(creds2.connectionId).toBe("fb-2");

    const creds3 = await getProviderCredentials("freebuff", null, "model-A");
    expect(creds3.connectionId).toBe("fb-1");
  });

  it("does not falsely return FREEBUFF_MODEL_LOCKED when 0 accounts are available (disabled/unavailable)", async () => {
    // All accounts disabled
    connectionsDb.set("fb-disabled", {
      id: "fb-disabled",
      provider: "freebuff",
      authType: "oauth",
      name: "Disabled Account",
      accessToken: "token-d",
      isActive: false,
      testStatus: "disabled",
      lockedToModel: null,
      lockedToModelUntil: null,
    });

    const creds = await getProviderCredentials("freebuff", null, "openai/gpt-5.6-luna");
    // Must NOT be FREEBUFF_MODEL_LOCKED; report the account state instead.
    expect(creds).toMatchObject({
      allRateLimited: true,
      lastErrorCode: "ACCOUNT_UNAVAILABLE",
    });
  });

  it("classifies exhausted accounts separately from missing credentials", async () => {
    connectionsDb.set("ocz-exhausted", {
      id: "ocz-exhausted",
      provider: "opencode-zen",
      authType: "apikey",
      accessToken: "token",
      isActive: true,
      testStatus: "exhausted",
      modelLocks: {},
    });

    const creds = await getProviderCredentials("opencode-zen", null, "muse-spark-1.2-contributor-free");

    expect(creds).toMatchObject({
      allRateLimited: true,
      lastErrorCode: "ACCOUNT_EXHAUSTED",
    });
    expect(creds.lastError).toContain("accounts are exhausted");
  });

  it("classifies unavailable accounts separately from exhausted accounts", async () => {
    connectionsDb.set("ocz-unavailable", {
      id: "ocz-unavailable",
      provider: "opencode-zen",
      authType: "apikey",
      accessToken: "token",
      isActive: true,
      testStatus: "unavailable",
      modelLocks: {},
    });

    const creds = await getProviderCredentials("opencode-zen", null, "muse-spark-1.2-contributor-free");

    expect(creds).toMatchObject({
      allRateLimited: true,
      lastErrorCode: "ACCOUNT_UNAVAILABLE",
    });
    expect(creds.lastError).toContain("unavailable or disabled");
  });

  it("classifies disabled accounts when the active credential query is empty", async () => {
    connectionsDb.set("ocz-disabled", {
      id: "ocz-disabled",
      provider: "opencode-zen",
      authType: "apikey",
      accessToken: "token",
      isActive: false,
      testStatus: "disabled",
      modelLocks: {},
    });

    const creds = await getProviderCredentials("opencode-zen", null, "muse-spark-1.2-contributor-free");

    expect(creds).toMatchObject({
      allRateLimited: true,
      lastErrorCode: "ACCOUNT_UNAVAILABLE",
    });
  });

  it("skips accounts whose live quota cache shows remaining <= 0 for the requested model", async () => {
    connectionsDb.set("fb-quota-exhausted", {
      id: "fb-quota-exhausted",
      provider: "freebuff",
      authType: "oauth",
      name: "Exhausted Account",
      accessToken: "token-ex",
      isActive: true,
      testStatus: "active",
      lockedToModel: null,
      lockedToModelUntil: null,
    });
    connectionsDb.set("fb-quota-healthy", {
      id: "fb-quota-healthy",
      provider: "freebuff",
      authType: "oauth",
      name: "Healthy Account",
      accessToken: "token-ok",
      isActive: true,
      testStatus: "active",
      lockedToModel: null,
      lockedToModelUntil: null,
    });

    const resetAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    getFreebuffQuotaCache().set("fb-quota-exhausted", {
      "openai/gpt-5.6-luna": {
        remaining: 0,
        unlimited: false,
        resetAt,
      },
    });

    const creds = await getProviderCredentials("freebuff", null, "openai/gpt-5.6-luna");
    expect(creds.connectionId).toBe("fb-quota-healthy");
  });

  it("permits accounts whose live quota cache shows unlimited or remaining > 0", async () => {
    connectionsDb.set("fb-unmetered", {
      id: "fb-unmetered",
      provider: "freebuff",
      authType: "oauth",
      name: "Unmetered Account",
      accessToken: "token-unm",
      isActive: true,
      testStatus: "active",
      lockedToModel: null,
      lockedToModelUntil: null,
    });

    getFreebuffQuotaCache().set("fb-unmetered", {
      "deepseek/deepseek-v4-flash": {
        remaining: null,
        unlimited: true,
        resetAt: null,
      },
    });

    const creds = await getProviderCredentials("freebuff", null, "deepseek/deepseek-v4-flash");
    expect(creds.connectionId).toBe("fb-unmetered");
  });

  it("prioritizes an account locked to canonical model even when requested with short model name", async () => {
    // Account 1: locked to z-ai/glm-5.3-flash
    connectionsDb.set("fb-glm-locked", {
      id: "fb-glm-locked",
      provider: "freebuff",
      authType: "oauth",
      name: "GLM Locked Account",
      accessToken: "token-glm",
      isActive: true,
      testStatus: "active",
      priority: 2,
      lockedToModel: "z-ai/glm-5.3-flash",
      lockedToModelUntil: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    });

    // Account 2: unlocked / clean (higher priority)
    connectionsDb.set("fb-clean-high-prio", {
      id: "fb-clean-high-prio",
      provider: "freebuff",
      authType: "oauth",
      name: "Clean Account",
      accessToken: "token-clean",
      isActive: true,
      testStatus: "active",
      priority: 1,
      lockedToModel: null,
      lockedToModelUntil: null,
    });

    // Requesting short name "glm-5.3-flash" MUST match "z-ai/glm-5.3-flash" and pick fb-glm-locked
    const creds1 = await getProviderCredentials("freebuff", null, "glm-5.3-flash");
    expect(creds1.connectionId).toBe("fb-glm-locked");

    // Requesting with prefix "freebuff/glm-5.3-flash" or "fb/z-ai/glm-5.3-flash" also matches
    const creds2 = await getProviderCredentials("freebuff", null, "freebuff/glm-5.3-flash");
    expect(creds2.connectionId).toBe("fb-glm-locked");
  });
});

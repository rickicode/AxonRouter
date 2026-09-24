import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEVER_ACCOUNT_EXHAUSTED_PROVIDERS,
  providerAllowsAccountExhausted,
  isCreditQuotaErrorText,
  isAccountFullyExhausted,
  autoHealConnectionOnQuotaRestored,
} from "../../src/sse/services/accountExhaustionPolicy.js";
import { autoHealAntigravityOnQuotaRestored } from "../../src/sse/services/antigravityQuota.js";

const mocks = vi.hoisted(() => ({
  updateCalls: [],
  setProviderDeadCalls: [],
  modelFailCounts: new Map(),
}));

vi.mock("../../src/sse/utils/logger.js", () => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async ({ provider }) => [
    { id: "conn-cline-1", provider: "cline", isActive: true, testStatus: "active", modelLocks: {} },
    { id: "conn-or-1", provider: "openrouter", isActive: true, testStatus: "active", modelLocks: {} },
    { id: "conn-ag-1", provider: "antigravity", isActive: true, testStatus: "active", modelLocks: {} },
    { id: "conn-ag-2", provider: "antigravity", isActive: true, testStatus: "active", modelLocks: {} },
    { id: "conn-wb-1", provider: "workbuddy", isActive: true, testStatus: "active", modelLocks: {} },
  ]),
  updateProviderConnection: vi.fn(async (id, patch) => {
    mocks.updateCalls.push([id, patch]);
    return { id, ...patch };
  }),
  getProviderConnectionById: vi.fn(async (id) => {
    const list = [
      { id: "conn-cline-1", provider: "cline", isActive: true, testStatus: "active", modelLocks: {} },
      { id: "conn-or-1", provider: "openrouter", isActive: true, testStatus: "active", modelLocks: {} },
      { id: "conn-ag-1", provider: "antigravity", isActive: true, testStatus: "active", modelLocks: {} },
      { id: "conn-ag-2", provider: "antigravity", isActive: true, testStatus: "exhausted", lockedAllUntil: new Date(Date.now() + 3600000).toISOString(), modelLocks: { "gemini-2.5-flash": new Date(Date.now() + 3600000).toISOString() } },
      { id: "conn-wb-1", provider: "workbuddy", isActive: true, testStatus: "active", modelLocks: {} },
    ];
    return list.find((c) => c.id === id) || null;
  }),
  getSettings: vi.fn(async () => ({})),
  getProxyPools: vi.fn(async () => []),
  getUsageSnapshotByConnectionId: vi.fn(async (id) => {
    if (id === "conn-ag-2") {
      return {
        connectionId: id,
        quotas: {
          "gemini-2.5-flash": { remainingPercentage: 0, resetAt: new Date(Date.now() + 3600000).toISOString() },
          "gemini-2.5-pro": { remainingPercentage: 0, resetAt: new Date(Date.now() + 3600000).toISOString() },
          "claude-sonnet-4-6": { remainingPercentage: 0, resetAt: new Date(Date.now() + 3600000).toISOString() },
          "claude_gpt_weekly": { remainingPercentage: 0, resetAt: new Date(Date.now() + 3600000).toISOString() },
        },
      };
    }
    if (id === "conn-ag-1") {
      return {
        connectionId: id,
        quotas: {
          "gemini-2.5-flash": { remainingPercentage: 0, resetAt: new Date(Date.now() + 3600000).toISOString() },
          "gemini-2.5-pro": { remainingPercentage: 80, resetAt: new Date(Date.now() + 3600000).toISOString() },
          "claude-sonnet-4-6": { remainingPercentage: 100, resetAt: new Date(Date.now() + 3600000).toISOString() },
          "claude_gpt_weekly": { remainingPercentage: 100, resetAt: new Date(Date.now() + 3600000).toISOString() },
        },
      };
    }
    return null;
  }),
}));

vi.mock("@/lib/cache/client.js", () => ({
  getCachedConnections: vi.fn(async () => null),
  setCachedConnections: vi.fn(async () => {}),
  getBatchCooldowns: vi.fn(async () => new Set()),
  setAccountCooldown: vi.fn(async () => true),
  setModelCooldown: vi.fn(async () => true),
  clearModelCooldown: vi.fn(async () => true),
  clearAccountCooldown: vi.fn(async () => true),
  isAccountInCooldown: vi.fn(async () => false),
  isModelInCooldown: vi.fn(async () => false),
  invalidateCachedConnections: vi.fn(async () => {}),
  getLkg: vi.fn(async () => null),
  setLkg: vi.fn(async () => true),
  delLkg: vi.fn(async () => true),
  getDeadCircuit: vi.fn(async () => 0),
  incrDeadCircuit: vi.fn(async () => 1),
  resetDeadCircuit: vi.fn(async () => true),
  publishEvent: vi.fn(async () => {}),
  cacheGetRaw: vi.fn(async () => null),
  cacheSetRaw: vi.fn(async () => {}),
  cacheDelRaw: vi.fn(async () => {}),
  isCacheAvailable: vi.fn(() => true),
  incrModelFailCount: vi.fn(async (key) => {
    const cur = (mocks.modelFailCounts.get(key) || 0) + 1;
    mocks.modelFailCounts.set(key, cur);
    return cur;
  }),
  resetModelFailCount: vi.fn(async (key) => {
    mocks.modelFailCounts.delete(key);
    return true;
  }),
  setProviderDead: vi.fn(async (provider, ttl) => {
    mocks.setProviderDeadCalls.push([provider, ttl]);
    return true;
  }),
  isProviderDead: vi.fn(async () => false),
  clearProviderDead: vi.fn(async () => true),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({
    connectionProxyEnabled: false,
    proxyPoolId: null,
    legacyProxyUrl: null,
    legacyNoProxy: null,
  })),
  pickProxyPoolId: vi.fn(() => null),
}));

vi.mock("open-sse/services/usage/google.js", () => ({
  getAntigravityUsage: vi.fn(async () => null),
}));

const { markAccountUnavailable } = await import("../../src/sse/services/auth.js");

beforeEach(() => {
  mocks.updateCalls = [];
  mocks.setProviderDeadCalls = [];
  mocks.modelFailCounts.clear();
});

const patchFor = (id) => mocks.updateCalls.find(([cid]) => cid === id)?.[1] || {};

describe("Account Exhaustion Policy", () => {
  it("never marks free-tier or free-surviving providers as exhausted", () => {
    const freeTierProviders = [
      "cline",
      "cline-free",
      "openrouter",
      "opencode",
      "opencode-zen",
      "freebuff",
      "kilocode",
      "bai",
      "github",
      "gemini",
      "gemini-cli",
      "kilocode-free",
    ];
    for (const p of freeTierProviders) {
      expect(providerAllowsAccountExhausted(p)).toBe(false);
      expect(NEVER_ACCOUNT_EXHAUSTED_PROVIDERS.has(p)).toBe(true);
    }
  });

  it("allows exhaustion for pooled credit providers and antigravity", () => {
    expect(providerAllowsAccountExhausted("antigravity")).toBe(true);
    expect(providerAllowsAccountExhausted("unikey")).toBe(true);
    expect(providerAllowsAccountExhausted("cloudflare-ai")).toBe(true);
    expect(providerAllowsAccountExhausted("codebuddy-cn")).toBe(true);
    expect(providerAllowsAccountExhausted("workbuddy")).toBe(true);
  });

  it("identifies credit and quota exhaustion error texts correctly", () => {
    expect(isCreditQuotaErrorText("insufficient_quota")).toBe(true);
    expect(isCreditQuotaErrorText("credits exhausted")).toBe(true);
    expect(isCreditQuotaErrorText("预扣费额度失败")).toBe(true);
    expect(isCreditQuotaErrorText("Your balance is too low")).toBe(true);
    expect(isCreditQuotaErrorText("Rate limit reached: please slow down")).toBe(false);
  });

  it("isAccountFullyExhausted requires snapshot proof for antigravity", () => {
    const partialSnapshot = {
      quotas: {
        "gemini-2.5-flash": { remainingPercentage: 0 },
        "gemini-2.5-pro": { remainingPercentage: 50 },
      },
    };
    expect(isAccountFullyExhausted("conn-ag-1", "antigravity", partialSnapshot)).toBe(false);

    const future = new Date(Date.now() + 3600000).toISOString();
    const fullExhaustSnapshot = {
      quotas: {
        "gemini-2.5-flash": { remainingPercentage: 0, resetAt: future },
        "gemini-2.5-pro": { remainingPercentage: 0, resetAt: future },
        "claude-sonnet-4-6": { remainingPercentage: 0, resetAt: future },
        "claude_gpt_weekly": { remainingPercentage: 0, resetAt: future },
      },
    };
    expect(isAccountFullyExhausted("conn-ag-2", "antigravity", fullExhaustSnapshot)).toBe(true);
  });

  it("downgrades credit exhaustion to model lock on free-tier providers (cline)", async () => {
    await markAccountUnavailable(
      "conn-cline-1",
      402,
      "insufficient credits for model claude-3-5-sonnet",
      "cline",
      "claude-3-5-sonnet",
      null,
      null
    );

    const patch = patchFor("conn-cline-1");
    // Must NOT be exhausted!
    expect(patch.testStatus).not.toBe("exhausted");
    expect(patch.testStatus).toBe("active");
    // Model lock must be set for the failing model
    expect(patch["modelLock_claude-3-5-sonnet"]).toBeTruthy();
    // Account-wide lock must NOT be set so free models keep serving
    expect(patch.lockedAllUntil).toBeUndefined();
  });

  it("downgrades quota 429 to model lock on OpenRouter", async () => {
    await markAccountUnavailable(
      "conn-or-1",
      429,
      "quota exceeded on model anthropic/claude-3.5-sonnet",
      "openrouter",
      "anthropic/claude-3.5-sonnet",
      null,
      null
    );

    const patch = patchFor("conn-or-1");
    expect(patch.testStatus).not.toBe("exhausted");
    expect(patch["modelLock_anthropic/claude-3.5-sonnet"]).toBeTruthy();
    expect(patch.lockedAllUntil).toBeUndefined();
  });

  it("keeps antigravity account active on single-model quota 429 when another model has quota", async () => {
    // conn-ag-1 has 80% on gemini-2.5-pro, 0% on flash
    await markAccountUnavailable(
      "conn-ag-1",
      429,
      "Resource has been exhausted (e.g. check quota)",
      "antigravity",
      "gemini-2.5-flash",
      null,
      null
    );

    const patch = patchFor("conn-ag-1");
    expect(patch.testStatus).toBe("active");
    expect(patch.testStatus).not.toBe("exhausted");
    expect(patch["modelLock_gemini-2.5-flash"]).toBeTruthy();
  });

  it("marks antigravity exhausted only when gemini and claude families are both 0%", async () => {
    // conn-ag-2 has 0% on gemini and claude
    await markAccountUnavailable(
      "conn-ag-2",
      429,
      "Resource has been exhausted (e.g. check quota)",
      "antigravity",
      "gemini-2.5-flash",
      null,
      null
    );

    const patch = patchFor("conn-ag-2");
    expect(patch.testStatus).toBe("exhausted");
  });

  it("respects upstream resetsAtMs for antigravity model lock cooldown", async () => {
    const fiveHoursMs = 5 * 60 * 60 * 1000;
    const resetAt = Date.now() + fiveHoursMs;
    const res = await markAccountUnavailable(
      "conn-ag-1",
      429,
      "Resource has been exhausted (e.g. check quota)",
      "antigravity",
      "gemini-2.5-flash",
      resetAt,
      null
    );
    // Cooldown is precisely the remaining time until resetAt, not arbitrary escalated strikes
    expect(res.cooldownMs).toBeGreaterThanOrEqual(fiveHoursMs - 50);
    expect(res.cooldownMs).toBeLessThanOrEqual(fiveHoursMs + 50);
  });

  it("auto-heals exhausted antigravity connection when snapshot quota is restored", async () => {
    const restoredQuotas = {
      "gemini-2.5-flash": { remainingPercentage: 100, resetAt: new Date(Date.now() + 3600000).toISOString() },
      "gemini-2.5-pro": { remainingPercentage: 80, resetAt: new Date(Date.now() + 3600000).toISOString() },
    };

    const existing = {
      id: "conn-ag-2",
      provider: "antigravity",
      isActive: true,
      testStatus: "exhausted",
      lockedAllUntil: new Date(Date.now() + 3600000).toISOString(),
      modelLocks: { "gemini-2.5-flash": new Date(Date.now() + 3600000).toISOString() },
    };
    const healed = await autoHealAntigravityOnQuotaRestored("conn-ag-2", restoredQuotas, existing);
    expect(healed).toBe(true);

    const patch = patchFor("conn-ag-2");
    expect(patch.testStatus).toBe("active");
    expect(patch.lockedAllUntil).toBeNull();
    expect(patch.modelLocks).toEqual({});
  });
  it("auto-heals any provider connection when usage snapshot reports positive quota", async () => {
    const existing = {
      id: "conn-codex-1",
      provider: "codex",
      isActive: true,
      testStatus: "unavailable",
      lockedAllUntil: new Date(Date.now() + 3600000).toISOString(),
      modelLocks: { "gpt-4o": new Date(Date.now() + 3600000).toISOString() },
    };

    const healed = await autoHealConnectionOnQuotaRestored(
      "conn-codex-1",
      {
        provider: "codex",
        remainingPct: 90,
        quotas: {
          "gpt-4o": { remaining: 90, total: 100, used: 10 },
        },
      },
      existing
    );
    expect(healed).toBe(true);

    const patch = patchFor("conn-codex-1");
    expect(patch.testStatus).toBe("active");
    expect(patch.lockedAllUntil).toBeNull();
    expect(patch.modelLocks).toEqual({});
  });

  it("triggers provider circuit breaker on 25 upstream 5xx errors", async () => {
    for (let i = 0; i < 24; i++) {
      await markAccountUnavailable("conn-wb-1", 500, "Internal server error", "workbuddy", "model-a");
    }
    expect(mocks.setProviderDeadCalls.length).toBe(0);

    // 25th error triggers circuit breaker
    await markAccountUnavailable("conn-wb-1", 500, "Internal server error", "workbuddy", "model-a");
    expect(mocks.setProviderDeadCalls.length).toBe(1);
    expect(mocks.setProviderDeadCalls[0][0]).toBe("workbuddy");
    expect(mocks.setProviderDeadCalls[0][1]).toBe(600);
  });
});

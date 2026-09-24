import { beforeEach, describe, expect, it, vi } from "vitest";

// Principle under test: an account is EXHAUSTED only when credits/quota are
// actually gone. Bare throttles, daily caps without credit wording, and
// transient errors on accounts with a stale snapshot must ride timed locks
// ("unavailable" / model-only), never "exhausted".

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const exhaustedSnapshot = {
  connectionId: "ag-snap",
  quotas: {
    "testmodel-flash": { remainingPercentage: 0, resetAt: FUTURE },
    "claude-sonnet-4-6": { remainingPercentage: 0, resetAt: FUTURE },
  },
};

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  updateCalls: [],
}));

const CONNS = [
  { id: "codex-bare-1", provider: "codex", isActive: true, testStatus: "active", data: {} },
  { id: "codex-quota-1", provider: "codex", isActive: true, testStatus: "active", data: {} },
  { id: "codex-daily-1", provider: "codex", isActive: true, testStatus: "active", data: {} },
  { id: "ag-snap-1", provider: "antigravity", isActive: true, testStatus: "active", data: {} },
  { id: "ag-snap-2", provider: "antigravity", isActive: true, testStatus: "active", data: {} },
  {
    id: "ag-revive-1", provider: "antigravity", isActive: true, testStatus: "active",
    accessToken: "tok", providerSpecificData: {}, modelLocks: {},
  },
];

vi.mock("../../src/sse/utils/logger.js", () => ({
  warn: mocks.warn,
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: vi.fn(async () => null),
  getProviderConnections: vi.fn(async (args) =>
    CONNS.filter((c) => !args?.provider || c.provider === args.provider),
  ),
  updateProviderConnection: vi.fn(async (id, patch) => {
    mocks.updateCalls.push([id, patch]);
  }),
  getSettings: vi.fn(async () => ({})),
  getProxyPools: vi.fn(async () => []),
  getProviderNodes: vi.fn(async () => []),
  getBatchProviderQuotas: vi.fn(async () => [exhaustedSnapshot]),
  getUsageSnapshotByConnectionId: vi.fn(async () => exhaustedSnapshot),
}));

vi.mock("@/lib/cache/client.js", () => ({
  getCachedConnections: vi.fn(async () => null),
  setCachedConnections: vi.fn(async () => {}),
  getBatchCooldowns: vi.fn(async () => new Set()),
  setAccountCooldown: vi.fn(async () => true),
  setModelCooldown: vi.fn(async () => true),
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
  isCacheAvailable: vi.fn(() => false),
  incrModelFailCount: vi.fn(async () => 1),
  resetModelFailCount: vi.fn(async () => true),
  setProviderDead: vi.fn(async () => true),
  isProviderDead: vi.fn(async () => false),
  clearProviderDead: vi.fn(async () => true),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({
    connectionProxyEnabled: false,
    connectionProxyUrl: "",
    connectionNoProxy: "",
    proxyPoolId: null,
  })),
  pickProxyPoolId: vi.fn(() => null),
}));

vi.mock("open-sse/services/usage/google.js", () => ({
  getAntigravityUsage: vi.fn(async () => ({
    plan: "free",
    quotas: { "testmodel-flash": { remainingPercentage: 80, resetAt: FUTURE } },
  })),
}));

import {
  markAccountUnavailable,
  getProviderCredentials,
  classifyBlockedCredentials,
} from "../../src/sse/services/auth.js";
import { getAntigravityQuotaCache } from "../../src/sse/services/antigravityQuota.js";

beforeEach(() => {
  mocks.updateCalls = [];
  mocks.warn.mockClear();
});

const patchFor = (id) => mocks.updateCalls.find(([cid]) => cid === id)?.[1] || {};

describe("exhausted only when credits/quota are actually gone", () => {
  it("bare 429 throttle on pooled provider: unavailable, never exhausted", async () => {
    await markAccountUnavailable("codex-bare-1", 429, "Too many requests — slow down", "codex", "codex-model-a", null, null);
    const patch = patchFor("codex-bare-1");
    expect(patch.lockedAllUntil).toBeTruthy();
    expect(patch.testStatus).toBe("unavailable");
    expect(patch.testStatus).not.toBe("exhausted");
  });

  it("429 with explicit quota words: still exhausted", async () => {
    await markAccountUnavailable("codex-quota-1", 429, "quota exceeded for codex-model-a, try again in 1h", "codex", "codex-model-a", null, null);
    expect(patchFor("codex-quota-1").testStatus).toBe("exhausted");
  });

  it("429 daily cap without credit wording: unavailable, never exhausted", async () => {
    await markAccountUnavailable("codex-daily-1", 429, "daily limit reached for free tier", "codex", "codex-model-a", null, null);
    const patch = patchFor("codex-daily-1");
    expect(patch.lockedAllUntil).toBeTruthy();
    expect(patch.testStatus).toBe("unavailable");
  });

  it("transient 502 on account with stale exhausted snapshot: model lock only", async () => {
    await markAccountUnavailable("ag-snap-1", 502, "upstream bad gateway: connection reset", "antigravity", "testmodel-flash", null, null);
    const patch = patchFor("ag-snap-1");
    expect(patch.testStatus).toBe("active");
    expect(patch.lockedAllUntil).toBeUndefined();
    expect(patch["modelLock_testmodel-flash"]).toBeTruthy();
  });

  it("quota 429 on account with exhausted snapshot: exhausted (control)", async () => {
    await markAccountUnavailable("ag-snap-2", 429, "quota exhausted for testmodel-flash, try again in 2h", "antigravity", "testmodel-flash", null, null);
    expect(patchFor("ag-snap-2").testStatus).toBe("exhausted");
  });

  it("fleet alert: >=half the fleet blocked emits FLEET warn", () => {
    const conns = ["f1", "f2", "f3"].map((id) => ({
      id, isActive: true, testStatus: "exhausted",
      name: id, modelLocks: {},
    }));
    const res = classifyBlockedCredentials("workbuddy", "m", conns);
    expect(res.lastErrorCode).toBe("ACCOUNT_EXHAUSTED");
    expect(mocks.warn).toHaveBeenCalledWith("FLEET", expect.stringContaining("3/3"));
  });

  it("fully-blocked antigravity selection triggers background revive refresh", async () => {
    // exhaust the RAM cache for every antigravity candidate so the selection
    // is fully blocked and the revive path engages
    const { hydrateAntigravityQuotaCache } = await import("../../src/sse/services/antigravityQuota.js");
    for (const id of ["ag-snap-1", "ag-snap-2", "ag-revive-1"]) {
      hydrateAntigravityQuotaCache(id, {
        "testmodel-flash": { remainingPercentage: 0, resetAt: FUTURE },
      });
    }
    await getProviderCredentials("antigravity", null, "testmodel-flash");
    // current request still fails over, but the revive refresh lands shortly
    await new Promise((r) => setTimeout(r, 150));
    expect(getAntigravityQuotaCache().get("ag-revive-1")?.["testmodel-flash"]?.remainingPercentage).toBe(80);
  });
});

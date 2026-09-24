import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  updateProviderConnection: vi.fn(async () => {}),
  getProviderConnections: vi.fn(async () => []),
  cacheSetModelCooldown: vi.fn(async () => true),
  cacheSetAccountCooldown: vi.fn(async () => true),
  markPoolUnfit: vi.fn(),
}));

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => mocks.fetch(...args),
}));

vi.mock("../../open-sse/services/proxyPoolFitness.js", () => ({
  markPoolUnfit: mocks.markPoolUnfit,
  clearPoolUnfit: vi.fn(),
  isPoolFit: vi.fn(() => true),
}));
vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: vi.fn(async () => null),
  getProviderConnections: mocks.getProviderConnections,
  getSettings: vi.fn(async () => ({})),
  updateProviderConnection: mocks.updateProviderConnection,
  lockAccountToModel: vi.fn(async () => {}),
  unlockAccountModel: vi.fn(async () => {}),
  getProxyPools: vi.fn(async () => []),
  lockProxyPoolForScope: vi.fn(async () => {}),
}));

vi.mock("@/lib/cache/client.js", () => ({
  getCachedConnections: vi.fn(async () => null),
  setCachedConnections: vi.fn(async () => {}),
  getBatchCooldowns: vi.fn(async () => new Set()),
  setAccountCooldown: mocks.cacheSetAccountCooldown,
  setModelCooldown: mocks.cacheSetModelCooldown,
  invalidateCachedConnections: vi.fn(async () => {}),
  getLkg: vi.fn(async () => null),
  delLkg: vi.fn(async () => true),
  getDeadCircuit: vi.fn(async () => 0),
  incrDeadCircuit: vi.fn(async () => 1),
  resetDeadCircuit: vi.fn(async () => true),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
  pickProxyPoolId: vi.fn(() => null),
  markPoolUnfit: mocks.markPoolUnfit,
  isPoolFit: vi.fn(() => true),
}));

import {
  __test__,
} from "../../open-sse/executors/freebuff.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";
import { markAccountUnavailable } from "../../src/sse/services/auth.js";

const {
  requestSession,
  classifySessionGate,
  sessionGateFromText,
  sessionGateFromError,
  throwSessionGateError,
} = __test__;

describe("Freebuff Limited Tier (Proxy/IP Rate Limit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("open-sse/executors/freebuff.js", () => {
    it("requestSession throws limited_ip error on 429 rate_limited with accessTier 'limited'", async () => {
      const responseData = {
        status: "rate_limited",
        accessTier: "limited",
        model: "meta/muse-spark-1.3-contributor",
        pool: "freebucks",
        poolLabel: "Freebucks",
        limit: 25,
        recentCount: 25,
        period: "pacific_day",
        resetTimeZone: "America/Los_Angeles",
      };

      mocks.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => responseData,
      });

      const proxyOptions = { proxyPoolId: "pool-abc-123" };
      let caughtErr = null;
      try {
        await requestSession("test-token", "meta/muse-spark-1.3-contributor", proxyOptions);
      } catch (err) {
        caughtErr = err;
      }

      expect(caughtErr).toBeTruthy();
      expect(caughtErr.status).toBe(429);
      expect(caughtErr.code).toBe("limited_ip");
      expect(caughtErr.freebuffKind).toBe("limited_ip");
      expect(caughtErr.cooldownMs).toBe(30000);
      expect(caughtErr.poolScoped).toEqual({
        poolId: "pool-abc-123",
        scope: "freebuff::meta/muse-spark-1.3-contributor",
        reason: "limited_ip",
      });
    });

    it("classifySessionGate detects limited_ip, freebucks, and limited accessTier as limited_ip (not quota)", () => {
      expect(classifySessionGate("limited_ip")).toEqual({ kind: "limited_ip" });
      expect(classifySessionGate("freebucks")).toEqual({ kind: "limited_ip" });
      expect(classifySessionGate("ip_capped")).toEqual({ kind: "limited_ip" });

      // With message containing limited or freebucks
      expect(classifySessionGate("rate_limited", "freebucks limit reached")).toEqual({ kind: "limited_ip" });
      expect(classifySessionGate("rate_limited", "limited tier rate limited")).toEqual({ kind: "limited_ip" });

      // With meta containing accessTier or pool
      expect(
        classifySessionGate("rate_limited", "", null, { accessTier: "limited", pool: "freebucks" }),
      ).toEqual({ kind: "limited_ip" });

      // Standard account rate_limited without limited tier is quota
      expect(classifySessionGate("rate_limited", "account quota exceeded")).toEqual({ kind: "quota" });
    });

    it("sessionGateFromText detects limited tier JSON body and returns kind 'limited_ip'", () => {
      const rawText = JSON.stringify({
        status: "rate_limited",
        accessTier: "limited",
        model: "meta/muse-spark-1.3-contributor",
        pool: "freebucks",
        limit: 25,
        recentCount: 25,
      });

      const gate = sessionGateFromText(rawText);
      expect(gate).toEqual({ kind: "limited_ip" });
    });

    it("sessionGateFromError detects structured code, freebuffKind, or JSON message tail", () => {
      // Structured code
      expect(sessionGateFromError({ code: "limited_ip" })).toEqual({ kind: "limited_ip" });
      expect(sessionGateFromError({ code: "freebucks" })).toEqual({ kind: "limited_ip" });
      expect(sessionGateFromError({ freebuffKind: "limited_ip" })).toEqual({ kind: "limited_ip" });

      // Error message embedding JSON from requestSession
      const rawMessage = `[502]: Freebuff session request failed: 429 {"status":"rate_limited","accessTier":"limited","model":"meta/muse-spark-1.3-contributor","pool":"freebucks","poolLabel":"Freebucks","limit":25,"recentCount":25,"period":"pacific_day"}`;
      expect(sessionGateFromError(new Error(rawMessage))).toEqual({ kind: "limited_ip" });
    });

    it("throwSessionGateError marks proxy pool unfit and throws pool-scoped error for limited_ip", () => {
      let thrown = null;
      try {
        throwSessionGateError(
          { kind: "limited_ip" },
          {
            token: "tok123",
            model: "meta/muse-spark-1.3-contributor",
            proxyKey: "proxy-url-1",
            poolId: "pool-xyz",
            log: console,
          },
        );
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeTruthy();
      expect(thrown.status).toBe(429);
      expect(thrown.code).toBe("limited_ip");
      expect(thrown.freebuffKind).toBe("limited_ip");
      expect(thrown.poolScoped).toEqual({
        poolId: "pool-xyz",
        scope: "freebuff::meta/muse-spark-1.3-contributor",
        reason: "limited_ip",
      });
      expect(mocks.markPoolUnfit).toHaveBeenCalledWith(
        "pool-xyz",
        "freebuff::meta/muse-spark-1.3-contributor",
        expect.any(Number),
        "limited_ip",
      );
    });
  });

  describe("open-sse/config/errorConfig.js & accountFallback.js", () => {
    it("checkFallbackError matches limited tier rules with 30s transient cooldown and lockAll false", () => {
      const err1 = 'Freebuff session request failed: 429 {"status":"rate_limited","accessTier":"limited"}';
      const res1 = checkFallbackError(429, err1);
      expect(res1.shouldFallback).toBe(true);
      expect(res1.cooldownMs).toBe(30000);
      expect(res1.lockAll).toBe(false);

      const err2 = 'Error: {"pool":"freebucks","status":"rate_limited"}';
      const res2 = checkFallbackError(429, err2);
      expect(res2.shouldFallback).toBe(true);
      expect(res2.cooldownMs).toBe(30000);
      expect(res2.lockAll).toBe(false);

      const err3 = "Freebuff limited tier rate limited on this proxy (limited accessTier/freebucks)";
      const res3 = checkFallbackError(429, err3);
      expect(res3.shouldFallback).toBe(true);
      expect(res3.cooldownMs).toBe(30000);
      expect(res3.lockAll).toBe(false);
    });
  });

  describe("src/sse/services/auth.js markAccountUnavailable", () => {
    it("sets 30s cooldown and does NOT write model_locks to PostgreSQL", async () => {
      mocks.getProviderConnections.mockResolvedValueOnce([
        { id: "conn-fb-1", provider: "freebuff", displayName: "FB User 1" },
      ]);

      const errorText = `[502]: Freebuff session request failed: 429 {"status":"rate_limited","accessTier":"limited","model":"meta/muse-spark-1.3-contributor","pool":"freebucks"}`;
      const result = await markAccountUnavailable(
        "conn-fb-1",
        429,
        errorText,
        "freebuff",
        "meta/muse-spark-1.3-contributor",
        null,
        "limited_ip",
      );

      expect(result).toEqual({ shouldFallback: true, cooldownMs: 30000 });
      expect(mocks.cacheSetModelCooldown).toHaveBeenCalledWith(
        "conn-fb-1",
        "meta/muse-spark-1.3-contributor",
        30,
      );
      // Ensure PostgreSQL connection is NOT modified with modelLocks
      expect(mocks.updateProviderConnection).not.toHaveBeenCalled();
    });

    it("matches from errorText even when freebuffKind is not explicitly passed", async () => {
      mocks.getProviderConnections.mockResolvedValueOnce([
        { id: "conn-fb-2", provider: "freebuff", displayName: "FB User 2" },
      ]);

      const errorText = `{"status":"rate_limited","accessTier":"limited","pool":"freebucks"}`;
      const result = await markAccountUnavailable(
        "conn-fb-2",
        429,
        errorText,
        "freebuff",
        "meta/muse-spark-1.3-contributor",
      );

      expect(result).toEqual({ shouldFallback: true, cooldownMs: 30000 });
      expect(mocks.cacheSetModelCooldown).toHaveBeenCalledWith(
        "conn-fb-2",
        "meta/muse-spark-1.3-contributor",
        30,
      );
      expect(mocks.updateProviderConnection).not.toHaveBeenCalled();
    });
  });
});

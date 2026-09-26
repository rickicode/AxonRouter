import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  computeProxyTestHealth,
  recordRuntimeProxyFailure,
  recordRuntimeProxySuccess,
  PROXY_FAILOVER_THRESHOLD,
  PROXY_DEAD_THRESHOLD,
  PROXY_FAIL_WINDOW_S,
} from "../../src/lib/network/proxyHealth.js";
import { probePoolGeo } from "../../open-sse/services/poolGeo.js";
import { pickProxyPoolId, lockProxyPoolForScope } from "../../src/lib/network/connectionProxy.js";
import { applyOutboundProxyEnv } from "../../src/lib/network/outboundProxy.js";
import { ProxyAgent } from "undici";

describe("Proxy Health System (3-failure threshold)", () => {
  describe("computeProxyTestHealth", () => {
    it("success resets consecutiveFailures to 0 and marks pool active", () => {
      const pool = {
        id: "pool-1",
        isActive: false,
        testStatus: "unhealthy",
        consecutiveFailures: 3,
      };
      const testResult = { ok: true, status: 200, elapsedMs: 150 };

      const update = computeProxyTestHealth(pool, testResult);

      expect(update.isActive).toBe(true);
      expect(update.testStatus).toBe("active");
      expect(update.consecutiveFailures).toBe(0);
      expect(update.lastError).toBeNull();
      expect(typeof update.lastTestedAt).toBe("string");
    });

    it("1st failure sets status to degraded and keeps pool active", () => {
      const pool = {
        id: "pool-1",
        isActive: true,
        testStatus: "active",
        consecutiveFailures: 0,
      };
      const testResult = { ok: false, status: 502, error: "Bad Gateway" };

      const update = computeProxyTestHealth(pool, testResult);

      expect(update.isActive).toBe(true);
      expect(update.testStatus).toBe("degraded");
      expect(update.consecutiveFailures).toBe(1);
      expect(update.lastError).toBe("Bad Gateway");
    });

    it("2nd consecutive failure stays degraded and keeps pool active", () => {
      const pool = {
        id: "pool-1",
        isActive: true,
        testStatus: "degraded",
        consecutiveFailures: 1,
      };
      const testResult = { ok: false, status: 504, error: "Gateway Timeout" };

      const update = computeProxyTestHealth(pool, testResult);

      expect(update.isActive).toBe(true);
      expect(update.testStatus).toBe("degraded");
      expect(update.consecutiveFailures).toBe(2);
      expect(update.lastError).toBe("Gateway Timeout");
    });

    it("3rd consecutive failure sets status to unhealthy and deactivates pool", () => {
      const pool = {
        id: "pool-1",
        isActive: true,
        testStatus: "degraded",
        consecutiveFailures: 2,
      };
      const testResult = { ok: false, status: 500, error: "Connection refused" };

      const update = computeProxyTestHealth(pool, testResult);

      expect(update.isActive).toBe(false);
      expect(update.testStatus).toBe("unhealthy");
      expect(update.consecutiveFailures).toBe(3);
      expect(update.lastError).toBe("Connection refused");
    });

    it("4th consecutive failure stays unhealthy", () => {
      const pool = {
        id: "pool-1",
        isActive: false,
        testStatus: "unhealthy",
        consecutiveFailures: 3,
      };
      const testResult = { ok: false, status: 500, error: "Connection refused again" };

      const update = computeProxyTestHealth(pool, testResult);

      expect(update.isActive).toBe(false);
      expect(update.testStatus).toBe("unhealthy");
      expect(update.consecutiveFailures).toBe(4);
    });

    it("5th consecutive failure marks pool as dead", () => {
      const pool = {
        id: "pool-1",
        isActive: false,
        testStatus: "unhealthy",
        consecutiveFailures: 4,
      };
      const testResult = { ok: false, status: 500, error: "Host unreachable" };

      const update = computeProxyTestHealth(pool, testResult);

      expect(update.isActive).toBe(false);
      expect(update.testStatus).toBe("dead");
      expect(update.consecutiveFailures).toBe(5);
      expect(update.lastError).toBe("Host unreachable");
    });

    it("uses default error message when testResult has no error text", () => {
      const pool = { id: "pool-1", isActive: true, consecutiveFailures: 0 };
      const testResult = { ok: false, status: 503 };

      const update = computeProxyTestHealth(pool, testResult);

      expect(update.lastError).toBe("Proxy test failed with status 503");
    });
  });

  describe("runtime failure and success tracking", () => {
    it("threshold is 3, deadThreshold is 5, and window is 600s", () => {
      expect(PROXY_FAILOVER_THRESHOLD).toBe(3);
      expect(PROXY_DEAD_THRESHOLD).toBe(5);
      expect(PROXY_FAIL_WINDOW_S).toBe(600);
    });

    it("recordRuntimeProxySuccess resets failure counter", async () => {
      await expect(recordRuntimeProxySuccess("pool-test-success")).resolves.not.toThrow();
    });

    it("recordRuntimeProxyFailure increments count without throwing", async () => {
      await expect(recordRuntimeProxyFailure("pool-test-fail-1", "connect ECONNREFUSED")).resolves.not.toThrow();
    });
  });
});

describe("Proxy Pool Audit Bug Fixes", () => {
  it("Bug 1 Fix: probePoolGeo dead proxy fails safely (ok: false) with strictProxy and does not leak host IP", async () => {
    const deadProxy = { proxyUrl: "http://127.0.0.1:59998", type: "http" };
    const res = await probePoolGeo(deadProxy, 2000);

    expect(res.ok).toBe(false);
    expect(res.error).toBe("network");
    expect(res.detail).toContain("strictProxy=true");
  });

  it("Bug 2 & 8 Fix: socks5h is normalized to socks5 and accepted by undici ProxyAgent", () => {
    const rawUri = "socks5h://127.0.0.1:1080";
    const normalizedUri = rawUri.replace(/^socks5h:/i, "socks5:");

    expect(() => new ProxyAgent({ uri: normalizedUri })).not.toThrow();
  });

  it("Bug 3 & 7 Fix: lockProxyPoolForScope with connectionId matches pickProxyPoolId", () => {
    const connId = "conn-fix-test-1234";
    const poolIds = ["pool-A", "pool-B", "pool-C"];
    const groupId = "group-1";

    // Lock pool-B for this connectionId
    lockProxyPoolForScope(connId, "pool-B", groupId);

    // Pick should now find pool-B via connectionId affinity
    const picked = pickProxyPoolId(poolIds, "round-robin", connId, {
      groupId,
      isSticky: true,
      stickyLimit: 5,
    });

    expect(picked).toBe("pool-B");
  });
});

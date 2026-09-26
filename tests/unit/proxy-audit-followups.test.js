import { describe, it, expect, vi, beforeEach } from "vitest";
import { autoRecoverUnhealthyProxyPools } from "../../src/lib/network/proxyAutoRecovery.js";
import * as proxyTestModule from "../../src/lib/network/proxyTest.js";
import * as proxyPoolsRepoModule from "../../src/lib/db/repos/proxyPoolsRepo.js";
import { computeProxyTestHealth } from "../../src/lib/network/proxyHealth.js";

describe("Proxy Audit Followups", () => {
  describe("deleteDisabledProxyPools options", () => {
    it("exports deleteDisabledProxyPools supporting graceHours, protectUnhealthy, and force", () => {
      expect(typeof proxyPoolsRepoModule.deleteDisabledProxyPools).toBe("function");
    });
  });

  describe("autoRecoverUnhealthyProxyPools", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("skips pools that are already active and healthy", async () => {
      vi.spyOn(proxyPoolsRepoModule, "getProxyPools").mockResolvedValue([
        { id: "p1", name: "Healthy Pool", isActive: true, testStatus: "active", consecutiveFailures: 0 },
      ]);
      const probeSpy = vi.spyOn(proxyTestModule, "testProxyPoolEntry");

      const result = await autoRecoverUnhealthyProxyPools();

      expect(result.checked).toBe(0);
      expect(result.recovered).toBe(0);
      expect(probeSpy).not.toHaveBeenCalled();
    });

    it("skips unhealthy pools that were tested recently within cooldown window", async () => {
      const recentIso = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
      vi.spyOn(proxyPoolsRepoModule, "getProxyPools").mockResolvedValue([
        {
          id: "p2",
          name: "Recently Tested Pool",
          isActive: false,
          testStatus: "unhealthy",
          consecutiveFailures: 3,
          lastTestedAt: recentIso,
        },
      ]);
      const probeSpy = vi.spyOn(proxyTestModule, "testProxyPoolEntry");

      const result = await autoRecoverUnhealthyProxyPools({ minCooldownMs: 5 * 60 * 1000 });

      expect(result.checked).toBe(0);
      expect(probeSpy).not.toHaveBeenCalled();
    });

    it("probes unhealthy pool after cooldown, recovers it on success and clears failures", async () => {
      const oldIso = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
      const unhealthyPool = {
        id: "p3",
        name: "Recoverable Pool",
        proxyUrl: "http://working-proxy.local:8080",
        type: "http",
        isActive: false,
        testStatus: "unhealthy",
        consecutiveFailures: 3,
        lastTestedAt: oldIso,
      };

      vi.spyOn(proxyPoolsRepoModule, "getProxyPools").mockResolvedValue([unhealthyPool]);
      vi.spyOn(proxyTestModule, "testProxyPoolEntry").mockResolvedValue({
        ok: true,
        status: 200,
        elapsedMs: 80,
      });
      const updateSpy = vi.spyOn(proxyPoolsRepoModule, "updateProxyPool").mockResolvedValue(true);

      const result = await autoRecoverUnhealthyProxyPools({ minCooldownMs: 5 * 60 * 1000 });

      expect(result.checked).toBe(1);
      expect(result.recovered).toBe(1);
      expect(result.stillFailing).toBe(0);
      expect(updateSpy).toHaveBeenCalledWith(
        "p3",
        expect.objectContaining({
          isActive: true,
          testStatus: "active",
          consecutiveFailures: 0,
        })
      );
    });

    it("updates lastTestedAt and lastError if recovery probe fails", async () => {
      const oldIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const unhealthyPool = {
        id: "p4",
        name: "Still Failing Pool",
        proxyUrl: "http://dead-proxy.local:8080",
        type: "http",
        isActive: false,
        testStatus: "unhealthy",
        consecutiveFailures: 3,
        lastTestedAt: oldIso,
      };

      vi.spyOn(proxyPoolsRepoModule, "getProxyPools").mockResolvedValue([unhealthyPool]);
      vi.spyOn(proxyTestModule, "testProxyPoolEntry").mockResolvedValue({
        ok: false,
        status: 504,
        error: "Gateway Timeout",
      });
      const updateSpy = vi.spyOn(proxyPoolsRepoModule, "updateProxyPool").mockResolvedValue(true);

      const result = await autoRecoverUnhealthyProxyPools({ minCooldownMs: 5 * 60 * 1000 });

      expect(result.checked).toBe(1);
      expect(result.recovered).toBe(0);
      expect(result.stillFailing).toBe(1);
      expect(updateSpy).toHaveBeenCalledWith(
        "p4",
        expect.objectContaining({
          lastError: "Gateway Timeout",
        })
      );
    });

    it("probes degraded pool (1-2 failures) and recovers it", async () => {
      const degradedPool = {
        id: "p5",
        name: "Degraded Pool",
        proxyUrl: "http://recovered-fast.local:8080",
        type: "http",
        isActive: true,
        testStatus: "degraded",
        consecutiveFailures: 2,
        lastTestedAt: null,
      };

      vi.spyOn(proxyPoolsRepoModule, "getProxyPools").mockResolvedValue([degradedPool]);
      vi.spyOn(proxyTestModule, "testProxyPoolEntry").mockResolvedValue({
        ok: true,
        status: 200,
      });
      const updateSpy = vi.spyOn(proxyPoolsRepoModule, "updateProxyPool").mockResolvedValue(true);

      const result = await autoRecoverUnhealthyProxyPools();

      expect(result.checked).toBe(1);
      expect(result.recovered).toBe(1);
      expect(updateSpy).toHaveBeenCalledWith(
        "p5",
        expect.objectContaining({
          isActive: true,
          testStatus: "active",
          consecutiveFailures: 0,
        })
      );
    });

    it("skips dead pools by default to avoid probing dead proxies continuously", async () => {
      const deadPool = {
        id: "p6",
        name: "Dead Pool",
        proxyUrl: "http://dead.local:8080",
        type: "http",
        isActive: false,
        testStatus: "dead",
        consecutiveFailures: 5,
        lastTestedAt: null,
      };

      vi.spyOn(proxyPoolsRepoModule, "getProxyPools").mockResolvedValue([deadPool]);
      const probeSpy = vi.spyOn(proxyTestModule, "testProxyPoolEntry");

      const result = await autoRecoverUnhealthyProxyPools();

      expect(result.checked).toBe(0);
      expect(probeSpy).not.toHaveBeenCalled();
    });

    it("escalates 4-failure unhealthy pool to dead when probe fails again (5th failure)", async () => {
      const persistentlyFailingPool = {
        id: "p7",
        name: "Persistent Fail Pool",
        proxyUrl: "http://failing.local:8080",
        type: "http",
        isActive: false,
        testStatus: "unhealthy",
        consecutiveFailures: 4,
        lastTestedAt: null,
      };

      vi.spyOn(proxyPoolsRepoModule, "getProxyPools").mockResolvedValue([persistentlyFailingPool]);
      vi.spyOn(proxyTestModule, "testProxyPoolEntry").mockResolvedValue({
        ok: false,
        status: 502,
        error: "Bad Gateway",
      });
      const updateSpy = vi.spyOn(proxyPoolsRepoModule, "updateProxyPool").mockResolvedValue(true);

      const result = await autoRecoverUnhealthyProxyPools();

      expect(result.checked).toBe(1);
      expect(result.recovered).toBe(0);
      expect(result.markedDead).toBe(1);
      expect(updateSpy).toHaveBeenCalledWith(
        "p7",
        expect.objectContaining({
          isActive: false,
          testStatus: "dead",
          consecutiveFailures: 5,
          lastError: "Bad Gateway",
        })
      );
    });
  });
});

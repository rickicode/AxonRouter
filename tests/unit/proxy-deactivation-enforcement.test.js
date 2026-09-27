import { describe, it, expect, beforeEach, vi } from "vitest";

const poolsDb = new Map();

vi.mock("@/models", () => ({
  getProxyPoolById: vi.fn(async (id) => poolsDb.get(id) || null),
  getProxyPools: vi.fn(async ({ isActive } = {}) => {
    const list = Array.from(poolsDb.values());
    if (isActive !== undefined) return list.filter((p) => p.isActive === isActive);
    return list;
  }),
}));

import {
  resolveConnectionProxyConfig,
  isPoolHealthy,
  evictProxyPoolFromRotateState,
} from "../../src/lib/network/connectionProxy.js";

describe("Proxy 3-Failure Deactivation & Exclusion Enforcement", () => {
  beforeEach(() => {
    poolsDb.clear();
  });

  it("isPoolHealthy correctly identifies inactive, unhealthy, dead, or >=3 failures", () => {
    expect(isPoolHealthy(null)).toBe(false);
    expect(isPoolHealthy({ isActive: false, testStatus: "active", consecutiveFailures: 0 })).toBe(false);
    expect(isPoolHealthy({ isActive: true, testStatus: "unhealthy", consecutiveFailures: 0 })).toBe(false);
    expect(isPoolHealthy({ isActive: true, testStatus: "dead", consecutiveFailures: 0 })).toBe(false);
    expect(isPoolHealthy({ isActive: true, testStatus: "degraded", consecutiveFailures: 3 })).toBe(false);
    expect(isPoolHealthy({ isActive: true, testStatus: "degraded", consecutiveFailures: 4 })).toBe(false);
    expect(isPoolHealthy({ isActive: true, testStatus: "active", consecutiveFailures: 0 })).toBe(true);
    expect(isPoolHealthy({ isActive: true, testStatus: "degraded", consecutiveFailures: 1 })).toBe(true);
    expect(isPoolHealthy({ isActive: true, testStatus: "degraded", consecutiveFailures: 2 })).toBe(true);
  });

  it("resolveConnectionProxyConfig skips pool with consecutiveFailures >= 3 even if isActive was true", async () => {
    poolsDb.set("pool-failing", {
      id: "pool-failing",
      name: "3x Failing Pool",
      proxyUrl: "http://127.0.0.1:9001",
      isActive: true,
      consecutiveFailures: 3,
      testStatus: "unhealthy",
    });
    poolsDb.set("pool-healthy", {
      id: "pool-healthy",
      name: "Healthy Pool",
      proxyUrl: "http://127.0.0.1:9002",
      isActive: true,
      consecutiveFailures: 0,
      testStatus: "active",
    });

    const res = await resolveConnectionProxyConfig(
      {
        proxyPoolIds: ["pool-failing", "pool-healthy"],
        proxyRotationStrategy: "round-robin",
      },
      "conn-check-1"
    );

    expect(res).not.toBeNull();
    expect(res.proxyPoolId).toBe("pool-healthy");
    expect(res.connectionProxyUrl).toBe("http://127.0.0.1:9002");
  });

  it("resolveConnectionProxyConfig returns null if all candidate pools have failed >= 3 times", async () => {
    poolsDb.set("pool-bad-1", {
      id: "pool-bad-1",
      name: "Bad 1",
      proxyUrl: "http://127.0.0.1:9003",
      isActive: false,
      consecutiveFailures: 3,
      testStatus: "unhealthy",
    });
    poolsDb.set("pool-bad-2", {
      id: "pool-bad-2",
      name: "Bad 2",
      proxyUrl: "http://127.0.0.1:9004",
      isActive: true,
      consecutiveFailures: 5,
      testStatus: "dead",
    });

    const res = await resolveConnectionProxyConfig(
      {
        proxyPoolIds: ["pool-bad-1", "pool-bad-2"],
        proxyRotationStrategy: "round-robin",
      },
      "conn-check-2"
    );

    expect(res.proxyPoolId).toBeNull();
    expect(res.connectionProxyEnabled).toBe(false);
  });
});

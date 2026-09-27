import { describe, it, expect, beforeEach, vi } from "vitest";

const poolsDb = new Map();
let currentSettings = {
  providerStrategies: {},
};

vi.mock("@/models", () => ({
  getProxyPoolById: vi.fn(async (id) => poolsDb.get(id) || null),
  getProxyPools: vi.fn(async ({ isActive, group, type } = {}) => {
    let list = Array.from(poolsDb.values());
    if (isActive !== undefined) list = list.filter((p) => p.isActive === isActive);
    if (group) list = list.filter((p) => p.group === group);
    if (type) list = list.filter((p) => p.type === type);
    return list;
  }),
  getProxyGroupByName: vi.fn(async (name) => {
    if (name === "proxy100") {
      return {
        id: "grp-100",
        name: "proxy100",
        isSticky: false,
        poolIds: ["p1", "p2"],
      };
    }
    return null;
  }),
  getProxyGroupById: vi.fn(async () => null),
  getSettings: vi.fn(async () => currentSettings),
}));

import { resolveConnectionProxyConfig } from "../../src/lib/network/connectionProxy.js";

describe("Provider Proxy Auto-Inheritance & Resolution", () => {
  beforeEach(() => {
    poolsDb.clear();
    currentSettings = {
      providerStrategies: {
        tokenharbor: {
          proxyGroup: "proxy100",
          rotateStrategy: "smart",
        },
      },
    };

    poolsDb.set("p1", {
      id: "p1",
      name: "Proxy 1",
      proxyUrl: "http://1.1.1.1:8080",
      isActive: true,
      testStatus: "active",
      consecutiveFailures: 0,
    });
    poolsDb.set("p2", {
      id: "p2",
      name: "Proxy 2",
      proxyUrl: "http://2.2.2.2:8080",
      isActive: true,
      testStatus: "active",
      consecutiveFailures: 0,
    });
  });

  it("resolves connection proxy config from group proxy100", async () => {
    const psd = {
      proxyGroup: "proxy100",
      proxyRotationStrategy: "smart",
    };
    const res = await resolveConnectionProxyConfig(psd, "conn-test-1");

    expect(res.source).toBe("pool");
    expect(res.connectionProxyEnabled).toBe(true);
    expect(["p1", "p2"]).toContain(res.proxyPoolId);
    expect(["http://1.1.1.1:8080", "http://2.2.2.2:8080"]).toContain(res.connectionProxyUrl);
  });

  it("honors providerStrategies fallback when connection has no proxy config", async () => {
    const rawPsd = {};
    const providerOverride = currentSettings.providerStrategies.tokenharbor;

    let psd = { ...rawPsd };
    const hasConnectionProxy =
      Boolean(psd.proxyGroup) ||
      Boolean(psd.proxyPoolId && psd.proxyPoolId !== "__none__") ||
      (Array.isArray(psd.proxyPoolIds) && psd.proxyPoolIds.length > 0) ||
      Boolean(psd.connectionProxyUrl);

    if (!hasConnectionProxy && providerOverride) {
      if (providerOverride.proxyGroup) {
        psd.proxyGroup = providerOverride.proxyGroup;
        psd.proxyRotationStrategy = providerOverride.rotateStrategy || "smart";
      }
    }

    const res = await resolveConnectionProxyConfig(psd, "conn-fallback-1");
    expect(res.source).toBe("pool");
    expect(res.connectionProxyEnabled).toBe(true);
    expect(["p1", "p2"]).toContain(res.proxyPoolId);
  });

  it("does not overwrite connection-level custom proxy if already configured", async () => {
    poolsDb.set("custom-pool", {
      id: "custom-pool",
      name: "Custom Pool",
      proxyUrl: "http://9.9.9.9:8080",
      isActive: true,
      testStatus: "active",
      consecutiveFailures: 0,
    });

    const customPsd = {
      proxyPoolId: "custom-pool",
    };
    const providerOverride = currentSettings.providerStrategies.tokenharbor;

    let psd = { ...customPsd };
    const hasConnectionProxy =
      Boolean(psd.proxyGroup) ||
      Boolean(psd.proxyPoolId && psd.proxyPoolId !== "__none__") ||
      (Array.isArray(psd.proxyPoolIds) && psd.proxyPoolIds.length > 0) ||
      Boolean(psd.connectionProxyUrl);

    if (!hasConnectionProxy && providerOverride) {
      if (providerOverride.proxyGroup) {
        psd.proxyGroup = providerOverride.proxyGroup;
      }
    }

    const res = await resolveConnectionProxyConfig(psd, "conn-custom-1");
    expect(res.source).toBe("pool");
    expect(res.proxyPoolId).toBe("custom-pool");
    expect(res.connectionProxyUrl).toBe("http://9.9.9.9:8080");
  });
});

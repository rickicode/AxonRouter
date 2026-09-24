import { describe, it, expect, beforeEach, vi } from "vitest";

const poolsDb = new Map();
const groupsDb = new Map();
const connectionsDb = new Map();
let settingsDb = {};

vi.mock("@/models", () => ({
  getProxyPoolById: vi.fn(async (id) => poolsDb.get(id) || null),
  getProxyPools: vi.fn(async ({ isActive, type, group } = {}) => {
    let list = Array.from(poolsDb.values());
    if (isActive !== undefined) list = list.filter((p) => p.isActive === isActive);
    if (type) list = list.filter((p) => p.type === type);
    if (group) list = list.filter((p) => (p.group || "").toLowerCase() === group.toLowerCase());
    return list;
  }),
  getProxyGroupById: vi.fn(async (id) => groupsDb.get(id) || null),
  getProxyGroupByName: vi.fn(async (name) => {
    const norm = String(name || "").trim().toLowerCase();
    for (const g of groupsDb.values()) {
      if (g.name.toLowerCase() === norm) return g;
    }
    return null;
  }),
  getProxyGroups: vi.fn(async () => Array.from(groupsDb.values())),
  getSettings: vi.fn(async () => settingsDb),
  updateSettings: vi.fn(async (patch) => {
    settingsDb = { ...settingsDb, ...patch };
    return settingsDb;
  }),
  createProxyGroup: vi.fn(async (data) => {
    const group = {
      id: data.id || `group-${Date.now()}-${Math.random()}`,
      name: data.name,
      description: data.description || "",
      isSticky: data.isSticky === true,
      stickyLimit: data.stickyLimit || 3,
      poolIds: data.poolIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    groupsDb.set(group.id, group);
    return group;
  }),
  updateProxyGroup: vi.fn(async (id, patch) => {
    const existing = groupsDb.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    groupsDb.set(id, updated);
    return updated;
  }),
  deleteProxyGroup: vi.fn(async (id) => {
    const existing = groupsDb.get(id);
    if (!existing) return null;
    groupsDb.delete(id);
    return existing;
  }),
  countProxyGroupBoundConnections: vi.fn(async (groupIdOrName) => {
    let count = 0;
    for (const c of connectionsDb.values()) {
      if (c.providerSpecificData?.proxyGroup === groupIdOrName) count += 1;
    }
    return count;
  }),
}));

import {
  pickProxyPoolId,
  resolveConnectionProxyConfig,
  matchDefaultGroupType,
} from "../../src/lib/network/connectionProxy.js";
import { resetPoolFitness, markPoolUnfit } from "open-sse/services/proxyPoolFitness.js";

describe("Proxy Groups & Sticky Round-Robin System", () => {
  beforeEach(() => {
    poolsDb.clear();
    groupsDb.clear();
    connectionsDb.clear();
    settingsDb = {};
    resetPoolFitness();
    if (globalThis.__axonrouterProxyRotateState__) {
      globalThis.__axonrouterProxyRotateState__.clear();
    }
  });

  describe("Default Auto-Groups Resolution", () => {
    it("matches default group alias strings to canonical types", () => {
      expect(matchDefaultGroupType("cloudflare")).toBe("cloudflare");
      expect(matchDefaultGroupType("Cloudflare Relay")).toBe("cloudflare");
      expect(matchDefaultGroupType("cf")).toBe("cloudflare");
      expect(matchDefaultGroupType("http")).toBe("http");
      expect(matchDefaultGroupType("httpp")).toBe("http");
      expect(matchDefaultGroupType("vercel")).toBe("vercel");
      expect(matchDefaultGroupType("deno")).toBe("deno");
      expect(matchDefaultGroupType("dino")).toBe("deno");
      expect(matchDefaultGroupType("custom-us-pool")).toBeNull();
    });

    it("automatically bundles and rotates active pools of type cloudflare", async () => {
      poolsDb.set("cf-1", { id: "cf-1", name: "CF 1", type: "cloudflare", proxyUrl: "https://cf1.workers.dev", isActive: true });
      poolsDb.set("cf-2", { id: "cf-2", name: "CF 2", type: "cloudflare", proxyUrl: "https://cf2.workers.dev", isActive: true });
      poolsDb.set("http-1", { id: "http-1", name: "HTTP 1", type: "http", proxyUrl: "http://1.1.1.1:8080", isActive: true });

      const res1 = await resolveConnectionProxyConfig({ proxyGroup: "Cloudflare Relay" }, "conn-1");
      const res2 = await resolveConnectionProxyConfig({ proxyGroup: "Cloudflare Relay" }, "conn-1");

      expect(res1.source).toBe("cloudflare");
      expect(res2.source).toBe("cloudflare");
      expect(["cf-1", "cf-2"]).toContain(res1.proxyPoolId);
      expect(["cf-1", "cf-2"]).toContain(res2.proxyPoolId);
      expect(res1.proxyPoolId).not.toBe(res2.proxyPoolId); // Rotates round-robin
    });

    it("automatically bundles active HTTP proxies", async () => {
      poolsDb.set("h-1", { id: "h-1", name: "HTTP 1", type: "http", proxyUrl: "http://10.0.0.1:8080", isActive: true });
      poolsDb.set("h-2", { id: "h-2", name: "HTTP 2", type: "http", proxyUrl: "http://10.0.0.2:8080", isActive: true });

      const res1 = await resolveConnectionProxyConfig({ proxyGroup: "http" }, "conn-http");
      const res2 = await resolveConnectionProxyConfig({ proxyGroup: "http" }, "conn-http");

      expect(res1.source).toBe("pool");
      expect(res1.connectionProxyUrl).toBe("http://10.0.0.1:8080");
      expect(res2.connectionProxyUrl).toBe("http://10.0.0.2:8080");
    });

    it("supports sticky round-robin on default groups when configured in settings", async () => {
      poolsDb.set("cf-1", { id: "cf-1", name: "CF 1", type: "cloudflare", proxyUrl: "https://cf1.workers.dev", isActive: true });
      poolsDb.set("cf-2", { id: "cf-2", name: "CF 2", type: "cloudflare", proxyUrl: "https://cf2.workers.dev", isActive: true });

      settingsDb = {
        defaultProxyGroupSettings: {
          cloudflare: { isSticky: true, stickyLimit: 2 },
        },
      };

      const res1 = await resolveConnectionProxyConfig({ proxyGroup: "cloudflare" }, "conn-cf-sticky");
      const res2 = await resolveConnectionProxyConfig({ proxyGroup: "cloudflare" }, "conn-cf-sticky");
      const res3 = await resolveConnectionProxyConfig({ proxyGroup: "cloudflare" }, "conn-cf-sticky");

      expect(res1.proxyPoolId).toBe("cf-1");
      expect(res2.proxyPoolId).toBe("cf-1"); // Sticky 2x
      expect(res3.proxyPoolId).toBe("cf-2"); // Rotates on 3rd request
    });
  });

  describe("Custom Proxy Groups & Sticky Round-Robin", () => {
    it("sticks to the same proxy up to stickyLimit times before rotating", async () => {
      poolsDb.set("p1", { id: "p1", name: "Proxy 1", type: "http", proxyUrl: "http://1.1.1.1:80", isActive: true });
      poolsDb.set("p2", { id: "p2", name: "Proxy 2", type: "http", proxyUrl: "http://2.2.2.2:80", isActive: true });

      groupsDb.set("grp-sticky", {
        id: "grp-sticky",
        name: "Sticky Cluster",
        isSticky: true,
        stickyLimit: 3,
        poolIds: ["p1", "p2"],
      });

      // Call 1 -> p1 (count 1)
      const r1 = await resolveConnectionProxyConfig({ proxyGroup: "Sticky Cluster" }, "conn-sticky");
      expect(r1.proxyPoolId).toBe("p1");

      // Call 2 -> p1 (count 2, sticky)
      const r2 = await resolveConnectionProxyConfig({ proxyGroup: "Sticky Cluster" }, "conn-sticky");
      expect(r2.proxyPoolId).toBe("p1");

      // Call 3 -> p1 (count 3, sticky)
      const r3 = await resolveConnectionProxyConfig({ proxyGroup: "Sticky Cluster" }, "conn-sticky");
      expect(r3.proxyPoolId).toBe("p1");

      // Call 4 -> p2 (rotated after 3 calls!)
      const r4 = await resolveConnectionProxyConfig({ proxyGroup: "Sticky Cluster" }, "conn-sticky");
      expect(r4.proxyPoolId).toBe("p2");

      // Call 5 -> p2 (count 2 on p2)
      const r5 = await resolveConnectionProxyConfig({ proxyGroup: "Sticky Cluster" }, "conn-sticky");
      expect(r5.proxyPoolId).toBe("p2");
    });

    it("rotates immediately if current sticky pool is excluded due to failure", async () => {
      poolsDb.set("p1", { id: "p1", name: "Proxy 1", type: "http", proxyUrl: "http://1.1.1.1:80", isActive: true });
      poolsDb.set("p2", { id: "p2", name: "Proxy 2", type: "http", proxyUrl: "http://2.2.2.2:80", isActive: true });

      groupsDb.set("grp-sticky", {
        id: "grp-sticky",
        name: "Sticky Failover",
        isSticky: true,
        stickyLimit: 5,
        poolIds: ["p1", "p2"],
      });

      // Call 1 -> p1
      const r1 = await resolveConnectionProxyConfig({ proxyGroup: "Sticky Failover" }, "conn-failover");
      expect(r1.proxyPoolId).toBe("p1");

      // Call 2 with p1 excluded (failed) -> immediately picks p2 without waiting for limit 5
      const r2 = await resolveConnectionProxyConfig({ proxyGroup: "Sticky Failover" }, "conn-failover", ["p1"]);
      expect(r2.proxyPoolId).toBe("p2");
    });

    it("isolates sticky state per connection", async () => {
      poolsDb.set("p1", { id: "p1", name: "Proxy 1", type: "http", proxyUrl: "http://1.1.1.1:80", isActive: true });
      poolsDb.set("p2", { id: "p2", name: "Proxy 2", type: "http", proxyUrl: "http://2.2.2.2:80", isActive: true });

      groupsDb.set("grp-sticky", {
        id: "grp-sticky",
        name: "Shared Group",
        isSticky: true,
        stickyLimit: 2,
        poolIds: ["p1", "p2"],
      });

      // Account A
      const a1 = await resolveConnectionProxyConfig({ proxyGroup: "Shared Group" }, "account-A");
      const a2 = await resolveConnectionProxyConfig({ proxyGroup: "Shared Group" }, "account-A");
      expect(a1.proxyPoolId).toBe("p1");
      expect(a2.proxyPoolId).toBe("p1");

      // Account B starts its own rotation
      const b1 = await resolveConnectionProxyConfig({ proxyGroup: "Shared Group" }, "account-B");
      expect(["p1", "p2"]).toContain(b1.proxyPoolId);

      // Account A 3rd request rotates
      const a3 = await resolveConnectionProxyConfig({ proxyGroup: "Shared Group" }, "account-A");
      expect(a3.proxyPoolId).toBe("p2");
    });

    it("supports non-sticky custom groups rotating on every request", async () => {
      poolsDb.set("p1", { id: "p1", name: "Proxy 1", type: "http", proxyUrl: "http://1.1.1.1:80", isActive: true });
      poolsDb.set("p2", { id: "p2", name: "Proxy 2", type: "http", proxyUrl: "http://2.2.2.2:80", isActive: true });

      groupsDb.set("grp-non-sticky", {
        id: "grp-non-sticky",
        name: "Strict RR",
        isSticky: false,
        poolIds: ["p1", "p2"],
      });

      const r1 = await resolveConnectionProxyConfig({ proxyGroup: "Strict RR" }, "conn-rr");
      const r2 = await resolveConnectionProxyConfig({ proxyGroup: "Strict RR" }, "conn-rr");
      const r3 = await resolveConnectionProxyConfig({ proxyGroup: "Strict RR" }, "conn-rr");

      expect(r1.proxyPoolId).toBe("p1");
      expect(r2.proxyPoolId).toBe("p2");
      expect(r3.proxyPoolId).toBe("p1");
    });
  });
});

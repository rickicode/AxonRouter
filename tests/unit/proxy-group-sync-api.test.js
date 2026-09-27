import { describe, it, expect, beforeEach, vi } from "vitest";

const poolsDb = new Map();
const groupsDb = new Map();

vi.mock("@/models", () => ({
  getProxyPools: vi.fn(async () => Array.from(poolsDb.values())),
  getProxyPoolById: vi.fn(async (id) => poolsDb.get(id) || null),
  getProxyGroups: vi.fn(async () => Array.from(groupsDb.values())),
  getProxyGroupById: vi.fn(async (id) => groupsDb.get(id) || null),
  getProxyGroupByName: vi.fn(async (name) => {
    const norm = String(name || "").trim().toLowerCase();
    for (const g of groupsDb.values()) {
      if (g.name.toLowerCase() === norm) return g;
    }
    return null;
  }),
  createProxyGroup: vi.fn(async (data) => {
    const group = {
      id: data.id || `group-${Date.now()}-${Math.random()}`,
      name: data.name,
      description: data.description || "",
      isSticky: data.isSticky === true,
      stickyLimit: data.stickyLimit || 3,
      poolIds: data.poolIds || [],
      fetchUrl: data.fetchUrl || null,
      fetchIntervalMs: data.fetchIntervalMs || 600000,
      lastFetchedAt: data.lastFetchedAt || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    groupsDb.set(group.id, group);
    return group;
  }),
  updateProxyGroup: vi.fn(async (id, patch) => {
    const existing = groupsDb.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    groupsDb.set(id, updated);
    return updated;
  }),
  deleteProxyGroup: vi.fn(async (id) => {
    const existing = groupsDb.get(id);
    if (!existing) return null;
    groupsDb.delete(id);
    return existing;
  }),
  countProxyGroupBoundConnections: vi.fn(async () => 0),
  getSettings: vi.fn(async () => ({})),
  updateSettings: vi.fn(async () => ({})),
}));

vi.mock("open-sse/services/proxyAutoFetcher.js", () => ({
  syncProxyGroupFromUrl: vi.fn(async (groupIdOrGroup) => {
    const id = typeof groupIdOrGroup === "object" ? groupIdOrGroup.id : groupIdOrGroup;
    const group = groupsDb.get(id);
    if (!group) throw new Error("Group not found");
    if (!group.fetchUrl) throw new Error("No fetchUrl");

    // Mock syncing: add 2 proxy pools and update group
    const p1 = { id: `pool-${id}-1`, name: `Auto-${group.name}-1`, proxyUrl: "http://1.1.1.1:8080", group: id, isActive: true };
    const p2 = { id: `pool-${id}-2`, name: `Auto-${group.name}-2`, proxyUrl: "http://2.2.2.2:8080", group: id, isActive: true };
    poolsDb.set(p1.id, p1);
    poolsDb.set(p2.id, p2);

    group.poolIds = [p1.id, p2.id];
    group.lastFetchedAt = new Date().toISOString();
    groupsDb.set(id, group);

    return {
      success: true,
      count: 2,
      poolIds: [p1.id, p2.id],
      retainedCount: 0,
      addedCount: 2,
      removedCount: 0,
      group,
    };
  }),
}));

import { GET as getProxyGroupsRoute, POST as createProxyGroupRoute } from "../../src/app/api/proxy-groups/route.js";
import { PUT as updateProxyGroupRoute } from "../../src/app/api/proxy-groups/[id]/route.js";
import { POST as syncProxyGroupRoute } from "../../src/app/api/proxy-groups/[id]/sync/route.js";
import { syncProxyGroupFromUrl } from "open-sse/services/proxyAutoFetcher.js";

describe("Proxy Group URL Sync API Endpoints", () => {
  beforeEach(() => {
    poolsDb.clear();
    groupsDb.clear();
    vi.clearAllMocks();
  });

  describe("POST /api/proxy-groups", () => {
    it("creates group with fetchUrl and fetchIntervalMs and triggers initial sync", async () => {
      const req = {
        json: async () => ({
          name: "Subscribed Group",
          description: "Auto-synced proxies",
          fetchUrl: "https://proxi.hijitoko.com/500proxy",
          fetchIntervalMs: 300000,
        }),
      };

      const res = await createProxyGroupRoute(req);
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.group).toBeDefined();
      expect(data.group.name).toBe("Subscribed Group");
      expect(data.group.fetchUrl).toBe("https://proxi.hijitoko.com/500proxy");
      expect(data.group.fetchIntervalMs).toBe(300000);
      expect(syncProxyGroupFromUrl).toHaveBeenCalledTimes(1);
      // Group should have populated pool IDs after initial sync
      expect(data.group.poolIds).toHaveLength(2);
      expect(data.group.lastFetchedAt).toBeTruthy();
    });

    it("creates standard group without fetchUrl without triggering sync", async () => {
      const req = {
        json: async () => ({
          name: "Manual Group",
          poolIds: [],
        }),
      };

      const res = await createProxyGroupRoute(req);
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.group.name).toBe("Manual Group");
      expect(data.group.fetchUrl).toBeNull();
      expect(syncProxyGroupFromUrl).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/proxy-groups", () => {
    it("enriches custom groups with fetchUrl, fetchIntervalMs, and lastFetchedAt", async () => {
      groupsDb.set("grp-1", {
        id: "grp-1",
        name: "Feed 1",
        poolIds: [],
        fetchUrl: "https://example.com/proxies.txt",
        fetchIntervalMs: 1800000,
        lastFetchedAt: "2026-09-27T10:00:00.000Z",
      });

      const res = await getProxyGroupsRoute();
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.customGroups).toHaveLength(1);
      const grp = data.customGroups[0];
      expect(grp.fetchUrl).toBe("https://example.com/proxies.txt");
      expect(grp.fetchIntervalMs).toBe(1800000);
      expect(grp.lastFetchedAt).toBe("2026-09-27T10:00:00.000Z");
    });
  });

  describe("PUT /api/proxy-groups/[id]", () => {
    it("accepts fetchUrl, fetchIntervalMs and triggers sync when fetchUrl is provided", async () => {
      groupsDb.set("grp-edit", {
        id: "grp-edit",
        name: "Existing Group",
        poolIds: [],
        fetchUrl: null,
        fetchIntervalMs: 600000,
        lastFetchedAt: null,
      });

      const req = {
        json: async () => ({
          fetchUrl: "https://new-feed.org/proxies",
          fetchIntervalMs: 3600000,
        }),
      };

      const res = await updateProxyGroupRoute(req, { params: Promise.resolve({ id: "grp-edit" }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.group.fetchUrl).toBe("https://new-feed.org/proxies");
      expect(data.group.fetchIntervalMs).toBe(3600000);
      expect(syncProxyGroupFromUrl).toHaveBeenCalledWith("grp-edit");
      expect(data.group.poolIds).toHaveLength(2);
    });
  });

  describe("POST /api/proxy-groups/[id]/sync", () => {
    it("returns 404 if group is not found", async () => {
      const res = await syncProxyGroupRoute({}, { params: Promise.resolve({ id: "non-existent" }) });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toMatch(/not found/i);
    });

    it("returns 400 if group has no fetchUrl", async () => {
      groupsDb.set("no-url", { id: "no-url", name: "No URL Group", fetchUrl: null });
      const res = await syncProxyGroupRoute({}, { params: Promise.resolve({ id: "no-url" }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/no fetchUrl/i);
    });

    it("triggers manual sync and returns count and group", async () => {
      groupsDb.set("grp-sync", {
        id: "grp-sync",
        name: "Sync Me",
        fetchUrl: "https://feed.me/list",
        poolIds: [],
      });

      const res = await syncProxyGroupRoute({}, { params: Promise.resolve({ id: "grp-sync" }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.count).toBe(2);
      expect(data.group).toBeDefined();
      expect(data.group.poolIds).toHaveLength(2);
      expect(syncProxyGroupFromUrl).toHaveBeenCalledWith("grp-sync");
    });
  });
});

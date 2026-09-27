import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseProxyLine,
  parseProxyList,
  reconcileProxyGroup,
  syncProxyGroupFromUrl,
  runProxyAutoFetcher,
} from "../../open-sse/services/proxyAutoFetcher.js";

describe("Proxy Auto Fetcher", () => {
  describe("parseProxyLine", () => {
    it("parses full URL with protocol scheme", () => {
      expect(parseProxyLine("http://user:pass@1.2.3.4:8080")).toBe("http://user:pass@1.2.3.4:8080");
      expect(parseProxyLine("https://proxy.example.com:8443")).toBe("https://proxy.example.com:8443");
      expect(parseProxyLine("socks5://user:pass@127.0.0.1:1080")).toBe("socks5://user:pass@127.0.0.1:1080");
    });

    it("parses user:pass@host:port without scheme into http:// URL", () => {
      expect(parseProxyLine("myuser:mypass@1.2.3.4:8080")).toBe("http://myuser:mypass@1.2.3.4:8080");
      expect(parseProxyLine("user:pass@node.proxy.net:3128")).toBe("http://user:pass@node.proxy.net:3128");
    });

    it("parses host:port:user:pass into http:// URL with credentials", () => {
      expect(parseProxyLine("1.2.3.4:8080:alice:secret")).toBe("http://alice:secret@1.2.3.4:8080");
      expect(parseProxyLine("proxy.domain.com:44445:session-123:pass-456")).toBe(
        "http://session-123:pass-456@proxy.domain.com:44445"
      );
    });

    it("parses host:port into http:// URL", () => {
      expect(parseProxyLine("1.2.3.4:8080")).toBe("http://1.2.3.4:8080");
      expect(parseProxyLine("gateway.node:3128")).toBe("http://gateway.node:3128");
    });

    it("filters out comments, empty lines, and invalid input", () => {
      expect(parseProxyLine("")).toBeNull();
      expect(parseProxyLine("   ")).toBeNull();
      expect(parseProxyLine("# This is a comment")).toBeNull();
      expect(parseProxyLine("// Another comment")).toBeNull();
      expect(parseProxyLine("not-a-proxy")).toBeNull();
      expect(parseProxyLine(null)).toBeNull();
    });

    it("strips trailing comments if separated by whitespace", () => {
      expect(parseProxyLine("1.2.3.4:8080 # comment note")).toBe("http://1.2.3.4:8080");
      expect(parseProxyLine("http://alice:secret@1.2.3.4:8080 // note")).toBe(
        "http://alice:secret@1.2.3.4:8080"
      );
    });
  });

  describe("parseProxyList", () => {
    it("parses plaintext newline-separated proxy lists and deduplicates", () => {
      const plaintext = `
# Proxy list header
http://alice:pass1@10.0.0.1:8080
10.0.0.2:8080:bob:pass2

# Duplicate
http://alice:pass1@10.0.0.1:8080

10.0.0.3:3128
user:pass@10.0.0.4:8080
`;
      const result = parseProxyList(plaintext);
      expect(result).toHaveLength(4);
      expect(result).toEqual([
        "http://alice:pass1@10.0.0.1:8080",
        "http://bob:pass2@10.0.0.2:8080",
        "http://10.0.0.3:3128",
        "http://user:pass@10.0.0.4:8080",
      ]);
    });

    it("parses JSON array of strings", () => {
      const json = JSON.stringify([
        "http://10.0.0.1:8080",
        "10.0.0.2:8080:user:pass",
        "socks5://10.0.0.3:1080",
      ]);
      const result = parseProxyList(json);
      expect(result).toHaveLength(3);
      expect(result).toEqual([
        "http://10.0.0.1:8080",
        "http://user:pass@10.0.0.2:8080",
        "socks5://10.0.0.3:1080",
      ]);
    });

    it("parses JSON array of objects with url/proxy/proxyUrl fields", () => {
      const json = JSON.stringify([
        { url: "http://10.0.0.1:8080" },
        { proxy: "10.0.0.2:8080:user:pass" },
        { proxyUrl: "user3:pass3@10.0.0.3:8080" },
      ]);
      const result = parseProxyList(json);
      expect(result).toHaveLength(3);
      expect(result).toEqual([
        "http://10.0.0.1:8080",
        "http://user:pass@10.0.0.2:8080",
        "http://user3:pass3@10.0.0.3:8080",
      ]);
    });

    it("parses 500-proxy plaintext lines accurately without throwing", () => {
      const lines = [];
      for (let i = 0; i < 500; i++) {
        lines.push(
          `http://brd-customer-hl_653c2cfd-zone-isp-session-px${i.toString().padStart(4, "0")}:hzilkfzrrgz0@brd.superproxy.io:44445`
        );
      }
      const rawText = lines.join("\n");
      const parsed = parseProxyList(rawText);
      expect(parsed).toHaveLength(500);
      expect(parsed[0]).toBe(lines[0]);
      expect(parsed[499]).toBe(lines[499]);
    });
  });

  describe("reconcileProxyGroup", () => {
    let mockPoolsTable = [];
    let mockGroupsTable = [];
    let mockDb;

    beforeEach(() => {
      mockPoolsTable = [];
      mockGroupsTable = [];

      mockDb = {
        driver: "postgres",
        async all(query, params = []) {
          if (query.includes("FROM proxy_pools")) {
            const groupId = params[0];
            const poolIds = params[1] || [];
            return mockPoolsTable.filter(
              (p) => p.group === groupId || poolIds.includes(p.id)
            );
          }
          if (query.includes("FROM proxy_groups")) {
            return mockGroupsTable;
          }
          return [];
        },
        async get(query, params = []) {
          if (query.includes("FROM proxy_groups")) {
            const id = params[0];
            return mockGroupsTable.find((g) => g.id === id) || null;
          }
          return null;
        },
        async run(query, params = []) {
          return { changes: 1 };
        },
        async transaction(fn) {
          const tx = {
            async run(q, p = []) {
              if (q.includes("INSERT INTO proxy_pools")) {
                const [id, name, proxyUrl, group, type, isActive, testStatus] = p;
                mockPoolsTable.push({
                  id,
                  name,
                  proxy_url: proxyUrl,
                  group,
                  type,
                  is_active: isActive,
                  test_status: testStatus,
                  last_tested_at: null,
                });
              } else if (q.includes("DELETE FROM proxy_pools")) {
                const idsToDelete = p[0] || [];
                mockPoolsTable = mockPoolsTable.filter((x) => !idsToDelete.includes(x.id));
              } else if (q.includes("UPDATE proxy_groups")) {
                const [id, poolIds] = p;
                const g = mockGroupsTable.find((x) => x.id === id);
                if (g) {
                  g.pool_ids = poolIds;
                  g.last_fetched_at = new Date().toISOString();
                  g.updated_at = new Date().toISOString();
                }
              }
              return { changes: 1 };
            },
            async get(q, p = []) {
              return mockDb.get(q, p);
            },
            async all(q, p = []) {
              return mockDb.all(q, p);
            },
          };
          return fn(tx);
        },
      };
    });

    it("preserves unchanged pool IDs and deletes obsolete ones", async () => {
      // Existing group with 2 pools
      const existingGroup = {
        id: "group-1",
        name: "Test Group",
        pool_ids: ["pool-keep", "pool-remove"],
        fetch_url: "https://example.com/proxies.txt",
        fetch_interval_ms: 600000,
        last_fetched_at: null,
      };
      mockGroupsTable.push(existingGroup);

      mockPoolsTable.push({
        id: "pool-keep",
        name: "Auto-Test Group-10.0.0.1:8080",
        proxy_url: "http://10.0.0.1:8080",
        group: "group-1",
        type: "http",
        is_active: true,
        test_status: "active",
        last_tested_at: "2026-09-27T10:00:00.000Z",
      });

      mockPoolsTable.push({
        id: "pool-remove",
        name: "Auto-Test Group-10.0.0.2:8080",
        proxy_url: "http://10.0.0.2:8080",
        group: "group-1",
        type: "http",
        is_active: true,
        test_status: "active",
        last_tested_at: "2026-09-27T10:00:00.000Z",
      });

      // Newly fetched list has 10.0.0.1:8080 (keep) and 10.0.0.3:8080 (new)
      const fetchedUrls = [
        "http://10.0.0.1:8080",
        "http://10.0.0.3:8080",
      ];

      const result = await reconcileProxyGroup(existingGroup, fetchedUrls, mockDb);

      expect(result.retainedCount).toBe(1);
      expect(result.addedCount).toBe(1);
      expect(result.removedCount).toBe(1);
      expect(result.count).toBe(2);

      // Verify that pool-keep is preserved with its original id and status
      const kept = mockPoolsTable.find((p) => p.id === "pool-keep");
      expect(kept).toBeDefined();
      expect(kept.proxy_url).toBe("http://10.0.0.1:8080");
      expect(kept.test_status).toBe("active");

      // Verify that pool-remove was deleted
      const removed = mockPoolsTable.find((p) => p.id === "pool-remove");
      expect(removed).toBeUndefined();

      // Verify that new pool was inserted
      const added = mockPoolsTable.find((p) => p.proxy_url === "http://10.0.0.3:8080");
      expect(added).toBeDefined();
      expect(added.name).toBe("Auto-Test Group-10.0.0.3:8080");
      expect(added.test_status).toBe("unknown");
      expect(added.is_active).toBe(true);

      // Verify group pool_ids updated
      expect(existingGroup.pool_ids).toContain("pool-keep");
      expect(existingGroup.pool_ids).toContain(added.id);
      expect(existingGroup.pool_ids).not.toContain("pool-remove");
    });
  });

  describe("syncProxyGroupFromUrl", () => {
    it("fetches proxies from group URL, reconciles and returns structured count", async () => {
      const mockGroup = {
        id: "grp-sync",
        name: "Remote Group",
        pool_ids: [],
        fetch_url: "https://mock.example.com/proxies",
        fetch_interval_ms: 600000,
        last_fetched_at: null,
      };

      const mockDb = {
        async get() {
          return mockGroup;
        },
        async all() {
          return [];
        },
        async run() {
          return { changes: 1 };
        },
        async transaction(fn) {
          return fn({
            async run() { return { changes: 1 }; },
            async get() { return mockGroup; },
            async all() { return []; },
          });
        },
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "http://proxy1.local:8080\nhttp://proxy2.local:8080",
      });

      try {
        const res = await syncProxyGroupFromUrl(mockGroup, mockDb);
        expect(res.success).toBe(true);
        expect(res.count).toBe(2);
        expect(res.addedCount).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("mocks fetch returning 50 proxies, verifies group insertion, poolIds update, and re-sync variation", async () => {
      let mockPools = [];
      let groupRecord = {
        id: "grp-50",
        name: "50-Proxy Group",
        pool_ids: [],
        fetch_url: "https://mock.example.com/50-proxies",
        fetch_interval_ms: 600000,
        last_fetched_at: null,
      };

      const mockDb = {
        async get(q, p = []) {
          if (q.includes("FROM proxy_groups")) {
            return groupRecord;
          }
          return null;
        },
        async all(q, p = []) {
          if (q.includes("FROM proxy_pools")) {
            const groupId = p[0];
            const poolIds = p[1] || [];
            return mockPools.filter((pool) => pool.group === groupId || poolIds.includes(pool.id));
          }
          return [];
        },
        async run(q, p = []) {
          return { changes: 1 };
        },
        async transaction(fn) {
          const tx = {
            async run(q, p = []) {
              if (q.includes("INSERT INTO proxy_pools")) {
                const [id, name, proxyUrl, group, type, isActive, testStatus] = p;
                mockPools.push({
                  id,
                  name,
                  proxy_url: proxyUrl,
                  group,
                  type,
                  is_active: isActive,
                  test_status: testStatus,
                });
              } else if (q.includes("DELETE FROM proxy_pools")) {
                const idsToDelete = p[0] || [];
                mockPools = mockPools.filter((x) => !idsToDelete.includes(x.id));
              } else if (q.includes("UPDATE proxy_groups")) {
                const [id, poolIds] = p;
                groupRecord.pool_ids = poolIds;
                groupRecord.last_fetched_at = new Date().toISOString();
                groupRecord.updated_at = new Date().toISOString();
              }
              return { changes: 1 };
            },
            async get(q, p = []) {
              return mockDb.get(q, p);
            },
            async all(q, p = []) {
              return mockDb.all(q, p);
            },
          };
          return fn(tx);
        },
      };

      // 1. Initial sync with 50 proxies
      const initial50 = [];
      for (let i = 1; i <= 50; i++) {
        initial50.push(`http://user${i}:pass${i}@10.0.1.${i}:8080`);
      }

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => initial50.join("\n"),
      });

      try {
        const res1 = await syncProxyGroupFromUrl(groupRecord, mockDb);
        expect(res1.success).toBe(true);
        expect(res1.count).toBe(50);
        expect(res1.addedCount).toBe(50);
        expect(res1.retainedCount).toBe(0);
        expect(res1.removedCount).toBe(0);

        // Verifies proxies are inserted with correct group
        expect(mockPools).toHaveLength(50);
        for (const pool of mockPools) {
          expect(pool.group).toBe("grp-50");
        }

        // Verifies group.poolIds is updated with all inserted pool IDs
        expect(res1.poolIds).toHaveLength(50);
        expect(groupRecord.pool_ids).toHaveLength(50);
        for (const pool of mockPools) {
          expect(groupRecord.pool_ids).toContain(pool.id);
        }

        const initialPoolIdMap = new Map(mockPools.map((p) => [p.proxy_url, p.id]));

        // 2. Re-sync with slight variation:
        // Keep 45 proxies (i = 6 to 50), remove 5 (i = 1 to 5), add 5 new ones (i = 51 to 55)
        const varied50 = [];
        for (let i = 6; i <= 55; i++) {
          varied50.push(`http://user${i}:pass${i}@10.0.1.${i}:8080`);
        }

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => varied50.join("\n"),
        });

        const res2 = await syncProxyGroupFromUrl(groupRecord, mockDb);
        expect(res2.success).toBe(true);
        expect(res2.count).toBe(50);
        expect(res2.retainedCount).toBe(45);
        expect(res2.addedCount).toBe(5);
        expect(res2.removedCount).toBe(5);

        // Verifies existing pool IDs are preserved
        for (let i = 6; i <= 50; i++) {
          const url = `http://user${i}:pass${i}@10.0.1.${i}:8080`;
          const expectedId = initialPoolIdMap.get(url);
          const pool = mockPools.find((p) => p.proxy_url === url);
          expect(pool).toBeDefined();
          expect(pool.id).toBe(expectedId);
          expect(groupRecord.pool_ids).toContain(expectedId);
        }

        // Verifies removed ones purged
        for (let i = 1; i <= 5; i++) {
          const url = `http://user${i}:pass${i}@10.0.1.${i}:8080`;
          const removedId = initialPoolIdMap.get(url);
          expect(mockPools.find((p) => p.id === removedId)).toBeUndefined();
          expect(groupRecord.pool_ids).not.toContain(removedId);
        }

        // Verifies new ones added
        for (let i = 51; i <= 55; i++) {
          const url = `http://user${i}:pass${i}@10.0.1.${i}:8080`;
          const pool = mockPools.find((p) => p.proxy_url === url);
          expect(pool).toBeDefined();
          expect(pool.group).toBe("grp-50");
          expect(groupRecord.pool_ids).toContain(pool.id);
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("throws error if group has no fetch_url configured", async () => {
      const noUrlGroup = {
        id: "grp-no-url",
        name: "No URL Group",
        pool_ids: [],
        fetch_url: null,
      };

      await expect(syncProxyGroupFromUrl(noUrlGroup)).rejects.toThrow(
        /no fetch_url configured/
      );
    });
  });

  describe("runProxyAutoFetcher", () => {
    it("runs without throwing on empty or populated database", async () => {
      const results = await runProxyAutoFetcher();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Proxy Groups Repository Schema & Mapping", () => {
    it("persists and reads fetchUrl, fetchIntervalMs, and lastFetchedAt", async () => {
      const {
        createProxyGroup,
        getProxyGroupById,
        updateProxyGroup,
        deleteProxyGroup,
      } = await import("../../src/lib/db/repos/proxyGroupsRepo.js");

      const groupName = `Auto Fetch Test ${Date.now()}`;
      const created = await createProxyGroup({
        name: groupName,
        fetchUrl: "https://example.com/test-proxies",
        fetchIntervalMs: 1800000,
      });

      try {
        expect(created.fetchUrl).toBe("https://example.com/test-proxies");
        expect(created.fetchIntervalMs).toBe(1800000);
        expect(created.lastFetchedAt).toBeNull();

        const fetched = await getProxyGroupById(created.id);
        expect(fetched).toBeDefined();
        expect(fetched.fetchUrl).toBe("https://example.com/test-proxies");
        expect(fetched.fetchIntervalMs).toBe(1800000);
        expect(fetched.lastFetchedAt).toBeNull();

        const nowIso = new Date().toISOString();
        const updated = await updateProxyGroup(created.id, {
          fetchIntervalMs: 3600000,
          lastFetchedAt: nowIso,
        });

        expect(updated.fetchIntervalMs).toBe(3600000);
        expect(updated.lastFetchedAt).toBe(nowIso);

        const refetched = await getProxyGroupById(created.id);
        expect(refetched.fetchIntervalMs).toBe(3600000);
        expect(new Date(refetched.lastFetchedAt).getTime()).toBeCloseTo(new Date(nowIso).getTime(), -3);
      } finally {
        await deleteProxyGroup(created.id);
      }
    });
  });
});

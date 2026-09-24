import { describe, it, expect, beforeAll } from "vitest";
import { getAdapter } from "@/lib/db/driver.js";
import {
  isCacheAvailable,
  setAccountCooldown,
  isAccountInCooldown,
  setModelCooldown,
  isModelInCooldown,
  getBatchCooldowns,
  getCachedConnections,
  setCachedConnections,
  acquireLock,
  releaseLock,
} from "@/lib/cache/client.js";
import {
  createProviderConnection,
  getProviderConnections,
  updateProviderConnection,
  deleteProviderConnection,
  getAvailableAccountsForRouting,
  getProviderSummaryStats,
  setProviderConnectionsActive,
} from "@/lib/db/repos/connectionsRepo.js";
import {
  createApiKey,
  getApiKeys,
  validateApiKey,
  deleteApiKey,
} from "@/lib/db/repos/apiKeysRepo.js";
import {
  upsertUsageSnapshot,
  getBatchProviderQuotas,
} from "@/lib/db/repos/usageSnapshotsRepo.js";
import { makeKv } from "@/lib/db/helpers/kvStore.js";
import { saveRequestDetail, getRequestDetails } from "@/lib/db/repos/requestDetailsRepo.js";
import { getChartData } from "@/lib/db/repos/usageRepo.js";
import { GET as healthGet } from "@/app/api/health/route.js";
import { GET as quotasGet } from "@/app/api/usage/quotas/route.js";
import { GET as clientGet } from "@/app/api/providers/client/route.js";
import { checkFallbackError, isFatalAuthError } from "open-sse/services/accountFallback.js";
import { markAccountUnavailable } from "@/sse/services/auth.js";
import {
  createProxyGroup,
  getProxyGroups,
  getProxyGroupById,
  getProxyGroupByName,
  updateProxyGroup,
  deleteProxyGroup,
} from "@/lib/db/repos/proxyGroupsRepo.js";
import { countProxyGroupBoundConnections } from "@/lib/db/repos/connectionsRepo.js";

describe("PostgreSQL Architecture E2E", () => {
  beforeAll(async () => {
    // Wait for connections to settle
    await new Promise((r) => setTimeout(r, 200));
  });

  it("should verify Postgres connection and migrations", async () => {
    const db = await getAdapter();
    expect(db).toBeDefined();
    const rows = await db.all(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tables = rows.map((r) => r.table_name);
    expect(tables).toContain("provider_connections");
    expect(tables).toContain("usage_snapshots");
    expect(tables).toContain("api_keys");
    expect(tables).toContain("proxy_groups");
    expect(tables).toContain("settings");
    expect(tables).toContain("request_details");
    expect(tables).toContain("usage_history");
  });

  it("should verify cache speed layer operations", async () => {
    if (isCacheAvailable()) {
      await setAccountCooldown("test-cache-conn", 10);
      const inCd = await isAccountInCooldown("test-cache-conn");
      expect(inCd).toBe(true);

      await setModelCooldown("test-cache-conn", "claude-3-7-sonnet", 10);
      const modelInCd = await isModelInCooldown(
        "test-cache-conn",
        "claude-3-7-sonnet",
      );
      expect(modelInCd).toBe(true);

      // Verify clearing cooldown via <= 0 removes key from cache
      await setAccountCooldown("test-cache-conn", 0);
      expect(await isAccountInCooldown("test-cache-conn")).toBe(false);

      await setModelCooldown("test-cache-conn", "claude-3-7-sonnet", 0);
      expect(await isModelInCooldown("test-cache-conn", "claude-3-7-sonnet")).toBe(false);

      const lock = await acquireLock("test-suite-lock", 10);
      expect(Boolean(lock)).toBe(true);
      await releaseLock("test-suite-lock", lock);

      // Verify batch cooldown check (O(1) roundtrip for thousands of connections)
      await setAccountCooldown("batch-conn-1", 10);
      await setModelCooldown("batch-conn-2", "gpt-4o", 10);
      const cooledDown = await getBatchCooldowns(
        ["batch-conn-1", "batch-conn-2", "batch-conn-3"],
        "gpt-4o"
      );
      expect(cooledDown.ids.has("batch-conn-1")).toBe(true);
      expect(cooledDown.ids.has("batch-conn-2")).toBe(true);
      expect(cooledDown.ids.has("batch-conn-3")).toBe(false);

      // Verify cached connections speed layer
      await setCachedConnections("test-provider", [{ id: "c1", provider: "test-provider" }], 5);
      const cached = await getCachedConnections("test-provider");
      expect(cached).toHaveLength(1);
      expect(cached[0].id).toBe("c1");
    }
  });

  it("should perform connection routing and fair-share jitter query", async () => {
    const created = await createProviderConnection({
      id: "e2e-conn-1",
      provider: "openai",
      authType: "apikey",
      name: "E2E OpenAI Test",
      apiKey: "sk-e2e-test",
      priority: 1,
      isActive: true,
    });
    expect(created.id).toBe("e2e-conn-1");

    const candidates = await getAvailableAccountsForRouting({
      provider: "openai",
      model: "gpt-4o",
      limit: 5,
    });
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates.some((c) => c.id === "e2e-conn-1")).toBe(true);

    // Cleanup
    await deleteProviderConnection("e2e-conn-1");
  });

  it("should batch query usage snapshots without N+1 problem", async () => {
    await createProviderConnection({
      id: "e2e-quota-conn",
      provider: "antigravity",
      authType: "oauth",
      name: "E2E Antigravity Quota Test",
      email: "quota@test.com",
      priority: 1,
      isActive: true,
    });

    await upsertUsageSnapshot({
      connectionId: "e2e-quota-conn",
      provider: "antigravity",
      plan: "pro",
      quotas: { "gemini-2.5-flash": { remainingPercentage: 75 } },
      remainingPct: 75,
    });

    const batch = await getBatchProviderQuotas("antigravity");
    expect(batch.length).toBeGreaterThanOrEqual(1);
    const found = batch.find((b) => b.connectionId === "e2e-quota-conn");
    expect(found).toBeDefined();
    expect(found.remainingPct).toBe(75);
    expect(found.name).toBe("E2E Antigravity Quota Test");

    // Cleanup
    await deleteProviderConnection("e2e-quota-conn");
  });

  it("should verify composite health check route", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.postgres).toBe(true);
  });

  it("should verify kvStore works with Postgres placeholders", async () => {
    const testKv = makeKv("test_scope");
    await testKv.set("hello", { foo: "bar" });
    const val = await testKv.get("hello");
    expect(val).toEqual({ foo: "bar" });

    await testKv.setMany({ a: 1, b: 2 });
    const all = await testKv.getAll();
    expect(all.a).toBe(1);
    expect(all.b).toBe(2);

    await testKv.remove("hello");
    const removed = await testKv.get("hello");
    expect(removed).toBeNull();
    await testKv.clear();
  });

  it("should safely handle non-timestamp model_locks values in routing", async () => {
    const conn = await createProviderConnection({
      id: "e2e-lock-conn",
      provider: "openai",
      authType: "apikey",
      name: "E2E Bad Lock Test",
      apiKey: "sk-bad-lock",
      priority: 1,
      isActive: true,
      modelLocks: { "gpt-4o": "invalid-non-date-value" },
    });
    expect(conn.id).toBe("e2e-lock-conn");

    // Routing query should not crash with Postgres timestamp syntax error
    const candidates = await getAvailableAccountsForRouting({
      provider: "openai",
      model: "gpt-4o",
      limit: 5,
    });
    expect(Array.isArray(candidates)).toBe(true);

    await deleteProviderConnection("e2e-lock-conn");
  });

  it("should classify account and model locks consistently", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const ids = ["e2e-status-active", "e2e-status-model", "e2e-status-all", "e2e-status-unavailable"];
    for (const item of [
      { id: ids[0], provider: "status-test", authType: "apikey", name: ids[0], isActive: true },
      { id: ids[1], provider: "status-test", authType: "apikey", name: ids[1], isActive: true, modelLocks: { "gpt-4o": future } },
      { id: ids[2], provider: "status-test", authType: "apikey", name: ids[2], isActive: true, modelLocks: { __all: future }, testStatus: "unavailable" },
      { id: ids[3], provider: "status-test", authType: "apikey", name: ids[3], isActive: true, testStatus: "unavailable" },
    ]) {
      await createProviderConnection(item);
    }

    try {
      const active = await getProviderConnections({ provider: "status-test", status: "active" });
      const exhausted = await getProviderConnections({ provider: "status-test", status: "exhausted" });
      const unavailable = await getProviderConnections({ provider: "status-test", status: "unavailable" });
      expect(active.map((c) => c.id)).toContain(ids[0]);
      expect(active.map((c) => c.id)).not.toContain(ids[1]);
      // Per-model lock is unavailable, never account-exhausted.
      expect(exhausted.map((c) => c.id)).not.toContain(ids[1]);
      expect(unavailable.map((c) => c.id)).toContain(ids[1]);
      expect(unavailable.map((c) => c.id)).toEqual(expect.arrayContaining([ids[2], ids[3]]));
    } finally {
      for (const id of ids) {
        await deleteProviderConnection(id);
      }
    }
  });

  it("should handle Antigravity model locks and Codex account locks accurately", async () => {
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const agConn = await createProviderConnection({
      id: "ag-lock-test",
      provider: "antigravity",
      authType: "oauth",
      name: "AG Lock Test",
      priority: 0,
      isActive: true,
      modelLocks: { "gemini-2.5-flash": future, "gemini-2.5-pro": past },
    });

    const codexConn = await createProviderConnection({
      id: "codex-lock-test",
      provider: "codex",
      authType: "oauth",
      name: "Codex Lock Test",
      priority: 0,
      isActive: true,
      lockedAllUntil: future,
    });

    try {
      // AG model locks never make the account exhausted on their own: the
      // account is exhausted only when both quota families are at 0%.
      const agExhausted = await getProviderConnections({ provider: "antigravity", status: "exhausted" });
      expect(agExhausted.map((c) => c.id)).not.toContain("ag-lock-test");

      // AG account should route for gemini-2.5-pro (lock is in past)
      const agProRouting = await getAvailableAccountsForRouting({
        provider: "antigravity",
        model: "gemini-2.5-pro",
        limit: 50,
      });
      expect(agProRouting.some((c) => c.id === "ag-lock-test")).toBe(true);

      // AG account should NOT route for gemini-2.5-flash (active lock)
      const agFlashRouting = await getAvailableAccountsForRouting({
        provider: "antigravity",
        model: "gemini-2.5-flash",
        limit: 50,
      });
      expect(agFlashRouting.some((c) => c.id === "ag-lock-test")).toBe(false);

      // Codex account has lockedAllUntil -> unavailable
      const codexUnavailable = await getProviderConnections({ provider: "codex", status: "unavailable" });
      expect(codexUnavailable.map((c) => c.id)).toContain("codex-lock-test");

      // Codex account should NOT route for any model
      const codexRouting = await getAvailableAccountsForRouting({
        provider: "codex",
        model: "gpt-5.5",
        limit: 50,
      });
      expect(codexRouting.some((c) => c.id === "codex-lock-test")).toBe(false);
    } finally {
      await deleteProviderConnection("ag-lock-test");
      await deleteProviderConnection("codex-lock-test");
    }
  });

  it("should return requests counts in getChartData across periods", async () => {
    for (const period of ["today", "24h", "7d", "30d", "60d"]) {
      const data = await getChartData(period);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      for (const bucket of data) {
        expect(bucket).toHaveProperty("label");
        expect(bucket).toHaveProperty("tokens");
        expect(bucket).toHaveProperty("cost");
        expect(bucket).toHaveProperty("requests");
        expect(typeof bucket.requests).toBe("number");
        expect(bucket.requests).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("should calculate provider summary stats and bulk toggle active in DB", async () => {
    const stats = await getProviderSummaryStats();
    expect(stats).toBeDefined();
    expect(typeof stats).toBe("object");

    // Test bulk toggle active
    const toggled = await setProviderConnectionsActive("openai", ["apikey"], true);
    expect(typeof toggled).toBe("number");
  });

  it("should verify batch quotas API route", async () => {
    const req = new Request("http://localhost/api/usage/quotas?provider=openai");
    const res = await quotasGet(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.quotas)).toBe(true);
  });

  it("should verify client usage connections and statusCounts with model/account locks", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const testIds = ["cli-status-active", "cli-status-exhausted", "cli-status-unavailable", "cli-status-disabled"];
    for (const item of [
      { id: testIds[0], provider: "antigravity", authType: "oauth", name: testIds[0], isActive: true },
      { id: testIds[1], provider: "antigravity", authType: "oauth", name: testIds[1], isActive: true, modelLocks: { "gemini-2.5-flash": future } },
      { id: testIds[2], provider: "antigravity", authType: "oauth", name: testIds[2], isActive: true, lockedAllUntil: future },
      { id: testIds[3], provider: "antigravity", authType: "oauth", name: testIds[3], isActive: false },
    ]) {
      await createProviderConnection(item);
    }

    try {
      const reqAll = new Request("http://localhost/api/providers/client?provider=antigravity&accountStatus=all");
      const resAll = await clientGet(reqAll);
      expect(resAll.status).toBe(200);
      const dataAll = await resAll.json();
      expect(dataAll.statusCounts).toBeDefined();
      expect(dataAll.statusCounts.active).toBeGreaterThanOrEqual(2);
      // A lone Antigravity model lock never exhausts the account: both quota
      // families must be at 0%. The model-locked fixture reads as active.
      expect(dataAll.statusCounts.unavailable).toBeGreaterThanOrEqual(1);
      expect(dataAll.statusCounts.disabled).toBeGreaterThanOrEqual(1);

      // Verify accountStatus=exhausted filtering (pageSize=500: fixture must not be cut off by existing accounts)
      const reqExhausted = new Request("http://localhost/api/providers/client?provider=antigravity&accountStatus=exhausted&pageSize=500");
      const resExhausted = await clientGet(reqExhausted);
      const dataExhausted = await resExhausted.json();
      const exhaustedIds = dataExhausted.connections.map((c) => c.id);
      expect(exhaustedIds).not.toContain(testIds[1]);
      expect(exhaustedIds).not.toContain(testIds[0]);
      expect(exhaustedIds).not.toContain(testIds[2]);
      expect(exhaustedIds).not.toContain(testIds[3]);

      // Verify accountStatus=unavailable filtering (pageSize=500: fixture must not be cut off by existing accounts)
      const reqUnavailable = new Request("http://localhost/api/providers/client?provider=antigravity&accountStatus=unavailable&pageSize=500");
      const resUnavailable = await clientGet(reqUnavailable);
      const dataUnavailable = await resUnavailable.json();
      const unavailableIds = dataUnavailable.connections.map((c) => c.id);
      expect(unavailableIds).toContain(testIds[2]);
      expect(unavailableIds).not.toContain(testIds[0]);
      expect(unavailableIds).not.toContain(testIds[1]);
    } finally {
      for (const id of testIds) {
        await deleteProviderConnection(id);
      }
    }
  });

  it("should detect fatal auth errors and disable accounts permanently", async () => {
    // Check fallback error classification for fatal vs non-fatal
    expect(checkFallbackError(401, "").disableAccount).toBe(true);
    expect(checkFallbackError(403, "invalid_api_key").disableAccount).toBe(true);
    expect(checkFallbackError(400, "account has been banned").disableAccount).toBe(true);
    expect(checkFallbackError(429, "rate limit exceeded").disableAccount).toBe(false);
    expect(checkFallbackError(500, "internal error").disableAccount).toBe(false);

    expect(isFatalAuthError(401, "")).toBe(true);
    expect(isFatalAuthError(403, "invalid_grant")).toBe(true);
    expect(isFatalAuthError(429, "rate limit")).toBe(false);

    // Create a connection and mark it with a fatal auth error
    const fatalConn = await createProviderConnection({
      id: "fatal-auth-conn",
      provider: "openai",
      authType: "apikey",
      name: "Fatal Auth Test",
      apiKey: "sk-fatal-invalid",
      priority: 1,
      isActive: true,
    });
    expect(fatalConn.isActive).toBe(true);

    try {
      const result = await markAccountUnavailable("fatal-auth-conn", 401, "invalid_api_key: The API key provided is invalid", "openai");
      expect(result.shouldFallback).toBe(true);

      const updated = await getProviderConnections({ provider: "openai" });
      const found = updated.find((c) => c.id === "fatal-auth-conn");
      expect(found).toBeDefined();
      expect(found.isActive).toBe(false);
      expect(found.testStatus).toBe("disabled");
    } finally {
      await deleteProviderConnection("fatal-auth-conn");
    }
  });

  it("should create, read, update, and delete proxy groups in PostgreSQL", async () => {
    const group = await createProxyGroup({
      id: "test-pg-group",
      name: "Postgres Test Group",
      description: "Testing proxy group persistence",
      isSticky: true,
      stickyLimit: 4,
      poolIds: ["pool-1", "pool-2"],
    });

    expect(group.id).toBe("test-pg-group");
    expect(group.name).toBe("Postgres Test Group");
    expect(group.isSticky).toBe(true);
    expect(group.stickyLimit).toBe(4);
    expect(group.poolIds).toEqual(["pool-1", "pool-2"]);

    const byId = await getProxyGroupById("test-pg-group");
    expect(byId).toBeDefined();
    expect(byId.name).toBe("Postgres Test Group");

    const byName = await getProxyGroupByName("postgres test group"); // Case-insensitive
    expect(byName).toBeDefined();
    expect(byName.id).toBe("test-pg-group");

    const updated = await updateProxyGroup("test-pg-group", {
      isSticky: false,
      stickyLimit: 1,
      poolIds: ["pool-1", "pool-3"],
    });
    expect(updated.isSticky).toBe(false);
    expect(updated.stickyLimit).toBe(1);
    expect(updated.poolIds).toEqual(["pool-1", "pool-3"]);

    const boundCount = await countProxyGroupBoundConnections("Postgres Test Group");
    expect(boundCount).toBe(0);

    const deleted = await deleteProxyGroup("test-pg-group");
    expect(deleted).toBeDefined();
    expect(await getProxyGroupById("test-pg-group")).toBeNull();
  });

  it("should handle malformed lock values safely and populate candidate fields", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const testIds = ["malformed-test-1", "malformed-test-2", "rate-limit-test", "test-status-unavail"];

    try {
      await createProviderConnection({
        id: testIds[0],
        provider: "malformed-test-provider",
        authType: "apikey",
        name: "Malformed Lock Conn",
        isActive: true,
        testStatus: "active",
        modelLocks: { "gpt-4o": "not-a-valid-date-string", __all: "invalid-iso" },
      });

      await createProviderConnection({
        id: testIds[1],
        provider: "malformed-test-provider",
        authType: "apikey",
        name: "Clean Conn",
        isActive: true,
        testStatus: "active",
      });

      await createProviderConnection({
        id: testIds[2],
        provider: "malformed-test-provider",
        authType: "apikey",
        name: "Rate Limited Conn",
        isActive: true,
        testStatus: "active",
        rateLimitedUntil: future,
      });

      await createProviderConnection({
        id: testIds[3],
        provider: "malformed-test-provider",
        authType: "apikey",
        name: "Test Status Unavail Conn",
        isActive: true,
        testStatus: "unavailable",
      });

      // Status query shouldn't crash with invalid date strings
      const activeConns = await getProviderConnections({ provider: "malformed-test-provider", status: "active" });
      expect(activeConns.map((c) => c.id)).toContain(testIds[0]); // fails open
      expect(activeConns.map((c) => c.id)).toContain(testIds[1]);
      expect(activeConns.map((c) => c.id)).not.toContain(testIds[3]);

      const unavailableConns = await getProviderConnections({ provider: "malformed-test-provider", status: "unavailable" });
      expect(unavailableConns.map((c) => c.id)).toContain(testIds[2]);
      expect(unavailableConns.map((c) => c.id)).toContain(testIds[3]);

      // Routing candidates must exclude rate-limited & unavailable-test-status connection and provide full properties
      const candidates = await getAvailableAccountsForRouting({
        provider: "malformed-test-provider",
        model: "gpt-4o",
        limit: 10,
      });

      expect(candidates.some((c) => c.id === testIds[2])).toBe(false);
      expect(candidates.some((c) => c.id === testIds[3])).toBe(false);
      const cleanCandidate = candidates.find((c) => c.id === testIds[1]);
      expect(cleanCandidate).toBeDefined();
      expect(cleanCandidate.isActive).toBe(true);
      expect(cleanCandidate.testStatus).toBe("active");
    } finally {
      for (const id of testIds) {
        await deleteProviderConnection(id);
      }
    }
  });
});

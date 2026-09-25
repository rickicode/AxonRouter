import { describe, it, expect } from "vitest";
import {
  acquireLock,
  releaseLock,
  setAccountCooldown,
  isAccountInCooldown,
  clearAccountCooldown,
  setModelCooldown,
  isModelInCooldown,
  getBatchCooldowns,
  registerActiveRequest,
  unregisterActiveRequest,
  getActiveRequestsDistributed,
  incrementInFlight,
  decrementInFlight,
  cacheSetRaw,
  cacheGetRaw,
  cacheDelRaw,
} from "@/lib/cache/client.js";

describe("Valkey Distributed Cache & Speed Layer", () => {
  it("handles basic raw cache get/set/del", async () => {
    const key = `test:raw:${Date.now()}`;
    await cacheSetRaw(key, "hello_valkey", 10);
    const val = await cacheGetRaw(key);
    expect(val).toBe("hello_valkey");
    await cacheDelRaw(key);
    const afterDel = await cacheGetRaw(key);
    expect(afterDel).toBeNull();
  });

  it("acquires and releases distributed locks with owner tokens", async () => {
    const lockKey = `unit_test_lock_${Date.now()}`;
    const token1 = await acquireLock(lockKey, 10);
    expect(token1).toBeTruthy();

    // Second acquire on the same key must fail
    const token2 = await acquireLock(lockKey, 10);
    expect(token2).toBeNull();

    // Release with wrong token must fail to release
    await releaseLock(lockKey, "wrong-token-1234");
    const token3 = await acquireLock(lockKey, 10);
    expect(token3).toBeNull();

    // Release with right token must succeed
    await releaseLock(lockKey, token1);
    const token4 = await acquireLock(lockKey, 10);
    expect(token4).toBeTruthy();
    await releaseLock(lockKey, token4);
  });

  it("manages account and model cooldowns", async () => {
    const connId = `conn_test_${Date.now()}`;
    expect(await isAccountInCooldown(connId)).toBe(false);

    await setAccountCooldown(connId, 10);
    expect(await isAccountInCooldown(connId)).toBe(true);

    await clearAccountCooldown(connId);
    expect(await isAccountInCooldown(connId)).toBe(false);

    const model = "gpt-4o";
    expect(await isModelInCooldown(connId, model)).toBe(false);
    await setModelCooldown(connId, model, 10);
    expect(await isModelInCooldown(connId, model)).toBe(true);

    const batch = await getBatchCooldowns([connId], model);
    expect(batch.ids.has(connId)).toBe(true);

    await setModelCooldown(connId, model, 0);
    expect(await isModelInCooldown(connId, model)).toBe(false);
  });

  it("tracks in-flight request concurrency atomically", async () => {
    const connId = `conn_inflight_${Date.now()}`;
    const count1 = await incrementInFlight(connId);
    expect(count1).toBe(1);

    const count2 = await incrementInFlight(connId);
    expect(count2).toBe(2);

    const count3 = await decrementInFlight(connId);
    expect(count3).toBe(1);

    const count4 = await decrementInFlight(connId);
    expect(count4).toBe(0);

    // Decrementing past 0 stays at 0
    const count5 = await decrementInFlight(connId);
    expect(count5).toBe(0);
  });

  it("registers and retrieves distributed active requests", async () => {
    const reqId = `req_dist_${Date.now()}`;
    const detail = {
      model: "claude-3-5-sonnet",
      provider: "anthropic",
      connectionId: "conn-123",
      apiKey: "sk-test",
    };

    await registerActiveRequest(reqId, detail);
    const active = await getActiveRequestsDistributed();
    const found = active.find((r) => r.requestId === reqId);
    expect(found).toBeDefined();
    expect(found?.model).toBe("claude-3-5-sonnet");

    await unregisterActiveRequest(reqId);
    const activeAfter = await getActiveRequestsDistributed();
    const foundAfter = activeAfter.find((r) => r.requestId === reqId);
    expect(foundAfter).toBeUndefined();
  });
});

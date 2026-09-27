import { describe, it, expect, vi } from "vitest";

const { mockExecutor, attempts } = vi.hoisted(() => {
  const attempts = [];
  const mockExecutor = {
    execute: vi.fn(async ({ proxyOptions }) => {
      attempts.push({
        connectionProxyEnabled: proxyOptions?.connectionProxyEnabled,
        proxyPoolId: proxyOptions?.proxyPoolId,
        failClosedProxy: proxyOptions?.failClosedProxy,
      });

      // Simulate failing on proxy pools, succeeding on direct egress
      if (proxyOptions?.connectionProxyEnabled && proxyOptions?.proxyPoolId) {
        throw new Error("[ProxyFetch] Proxy failed, no direct fallback (failClosedProxy=true): fetch failed");
      }

      // Direct egress succeeds
      return {
        response: new Response(JSON.stringify({ choices: [{ message: { content: "direct success" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }),
    parseError: vi.fn(() => null),
  };
  return { mockExecutor, attempts };
});

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: () => mockExecutor,
}));

import { handleChatCore } from "../../open-sse/handlers/chatCore.js";

describe("chatCore proxy fallback to direct", () => {
  it("rotates across proxy pools and falls back to direct when candidate pools run out", async () => {
    attempts.length = 0;
    const pools = ["pool-1", "pool-2"];
    const resolveProxyConfig = vi.fn(async (_creds, excludePoolIds = []) => {
      const remaining = pools.filter((p) => !excludePoolIds.includes(p));
      if (remaining.length === 0) return null;
      return {
        connectionProxyEnabled: true,
        connectionProxyUrl: `http://proxy-${remaining[0]}:8080`,
        proxyPoolId: remaining[0],
      };
    });

    const credentials = {
      id: "noauth",
      connectionName: "Public",
      providerSpecificData: {
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://proxy-pool-1:8080",
        proxyPoolId: "pool-1",
        failClosedProxy: true,
      },
    };

    const res = await handleChatCore({
      body: { model: "test/model", messages: [{ role: "user", content: "hi" }] },
      modelInfo: { provider: "opencode", model: "model" },
      credentials,
      resolveProxyConfig,
    });

    expect(res).toBeTruthy();
    // Sequence: pool-1 -> pool-2 -> direct
    expect(attempts.length).toBe(3);
    expect(attempts[0].proxyPoolId).toBe("pool-1");
    expect(attempts[1].proxyPoolId).toBe("pool-2");
    expect(attempts[2].connectionProxyEnabled).toBe(false);
    expect(attempts[2].proxyPoolId).toBe(null);
    expect(attempts[2].failClosedProxy).toBe(false);
  });

  it("falls back to direct when MAX_POOL_RETRIES is reached even if thousands of pools remain", async () => {
    attempts.length = 0;
    let poolIndex = 1;
    // An infinite pool generator simulating 5000 pools in proxy100
    const resolveProxyConfig = vi.fn(async (_creds, _excludePoolIds = []) => {
      poolIndex++;
      return {
        connectionProxyEnabled: true,
        connectionProxyUrl: `http://proxy-pool-${poolIndex}:8080`,
        proxyPoolId: `pool-${poolIndex}`,
      };
    });

    const credentials = {
      id: "noauth",
      connectionName: "Public",
      providerSpecificData: {
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://proxy-pool-1:8080",
        proxyPoolId: "pool-1",
        failClosedProxy: true,
      },
    };

    const res = await handleChatCore({
      body: { model: "test/model", messages: [{ role: "user", content: "hi" }] },
      modelInfo: { provider: "opencode", model: "model" },
      credentials,
      resolveProxyConfig,
    });

    expect(res).toBeTruthy();
    // Total attempts: Initial + 5 pool retries (MAX_POOL_RETRIES = 5) + 1 direct fallback = 7 attempts
    const lastAttempt = attempts[attempts.length - 1];
    expect(lastAttempt.connectionProxyEnabled).toBe(false);
    expect(lastAttempt.proxyPoolId).toBe(null);
    expect(lastAttempt.failClosedProxy).toBe(false);
  });
});

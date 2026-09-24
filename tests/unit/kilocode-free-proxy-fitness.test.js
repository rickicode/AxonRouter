import { describe, it, expect, vi } from "vitest";
import { KiloCodeFreeExecutor } from "../../open-sse/executors/kilocode-free.js";
import { parseUpstreamError } from "../../open-sse/utils/error.js";
import { markPoolUnfit, isPoolFit, clearPoolUnfit } from "../../open-sse/services/proxyPoolFitness.js";
import { pickProxyPoolId } from "../../src/lib/network/connectionProxy.js";

describe("KiloCode Free Proxy Fitness & Rotation on 429", () => {
  const scope = "kilocode-free::kilo-auto/free";
  const pools = ["proxy-pool-1", "proxy-pool-2", "proxy-pool-3"];

  it("parseError flags 429 as poolScoped ip-limit", async () => {
    const executor = new KiloCodeFreeExecutor();
    const fake429 = new Response(JSON.stringify({
      error: {
        message: "Rate limit exceeded. 200 requests per hour per IP.",
        code: 429
      }
    }), { status: 429, headers: { "Content-Type": "application/json" } });

    const parsed = await parseUpstreamError(fake429, executor);
    expect(parsed.statusCode).toBe(429);
    expect(parsed.poolScoped).toBeDefined();
    expect(parsed.poolScoped.reason).toBe("ip-limit");
  });

  it("marks pool unfit and filters it out using pickProxyPoolId", () => {
    clearPoolUnfit("proxy-pool-1", scope);
    clearPoolUnfit("proxy-pool-2", scope);
    expect(isPoolFit("proxy-pool-1", scope)).toBe(true);

    // Mark pool-1 unfit due to IP rate limit
    markPoolUnfit("proxy-pool-1", scope, Date.now() + 60000, "ip-limit");
    expect(isPoolFit("proxy-pool-1", scope)).toBe(false);

    // pickProxyPoolId must skip pool-1 and rotate to pool-2 or pool-3
    for (let i = 0; i < 10; i++) {
      const picked = pickProxyPoolId(pools, "round-robin", "kilocode-free", { scope });
      expect(picked).not.toBe("proxy-pool-1");
      expect(["proxy-pool-2", "proxy-pool-3"]).toContain(picked);
    }
  });
});

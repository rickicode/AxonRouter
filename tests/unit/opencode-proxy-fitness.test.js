import { describe, it, expect, beforeEach } from "vitest";
import { pickProxyPoolId } from "../../src/lib/network/connectionProxy.js";
import { markPoolUnfit, clearPoolUnfit } from "../../open-sse/services/proxyPoolFitness.js";

describe("OpenCode proxy fitness filtering", () => {
  const pools = ["pool-1", "pool-2", "pool-3"];
  const scope = "opencode::mimo-v2.5-free";

  beforeEach(() => {
    clearPoolUnfit("pool-1", scope);
    clearPoolUnfit("pool-2", scope);
    clearPoolUnfit("pool-3", scope);
  });

  it("filters out unfit pool for opencode even with round-robin strategy", () => {
    markPoolUnfit("pool-1", scope, Date.now() + 60000, "egress-rate-limit");

    // Picking should never return pool-1
    for (let i = 0; i < 10; i++) {
      const picked = pickProxyPoolId(pools, "round-robin", "opencode", { scope });
      expect(picked).not.toBe("pool-1");
      expect(["pool-2", "pool-3"]).toContain(picked);
    }
  });

  it("returns null if all pools are unfit for opencode", () => {
    markPoolUnfit("pool-1", scope, Date.now() + 60000, "egress-rate-limit");
    markPoolUnfit("pool-2", scope, Date.now() + 60000, "egress-rate-limit");
    markPoolUnfit("pool-3", scope, Date.now() + 60000, "egress-rate-limit");

    const picked = pickProxyPoolId(pools, "round-robin", "opencode", { scope });
    expect(picked).toBeNull();
  });
});

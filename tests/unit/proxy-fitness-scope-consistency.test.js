import { describe, it, expect, beforeEach } from "vitest";
import { pickProxyPoolId } from "../../src/lib/network/connectionProxy.js";
import { markPoolUnfit, clearPoolUnfit, resetPoolFitness } from "../../open-sse/services/proxyPoolFitness.js";

// Regression cover for the scope/fitness inconsistency: pools were marked unfit by
// executors across the codebase, but the picker only honoured those marks for three
// hardcoded providers on the "smart" strategy, and a mark written as
// `provider::model` was invisible to every other model of the same provider.
describe("proxy pool fitness scope consistency", () => {
  const pools = ["pool-1", "pool-2", "pool-3"];

  beforeEach(() => {
    resetPoolFitness();
  });

  it("honours an unfit mark for ANY provider, not just freebuff/opencode/kilocode-free", () => {
    markPoolUnfit("pool-1", "tokenharbor::*", Date.now() + 60_000, "region_blocked");

    for (let i = 0; i < 12; i++) {
      const picked = pickProxyPoolId(pools, "round-robin", "tokenharbor", {
        scope: "tokenharbor::deepseek-v4.1-flash:free",
      });
      expect(picked).not.toBe("pool-1");
      expect(["pool-2", "pool-3"]).toContain(picked);
    }
  });

  it("honours the mark even when the picker is handed a connectionId instead of a providerId", () => {
    // Production calls pickProxyPoolId(candidates, strategy, connectionId, ...), so the
    // provider allow-list checks inside it can never match. The scope is the only
    // signal that identifies the provider, so the scope must be enough.
    markPoolUnfit("pool-2", "tokenharbor::*", Date.now() + 60_000, "request_forbidden");

    const picked = pickProxyPoolId(pools, "round-robin", "3f2504e0-4f89-41d3-9a0c-0305e82c3301", {
      scope: "tokenharbor::glm-5.3-flash",
    });
    expect(picked).not.toBe("pool-2");
  });

  it("a provider-wide mark excludes the pool for EVERY model of that provider", () => {
    markPoolUnfit("pool-3", "tokenharbor::*", Date.now() + 60_000, "proxy_connection_failed");

    for (const model of ["deepseek-v4.1-flash:free", "glm-5.3-flash", "mimo-v2.6-flash:free"]) {
      const picked = pickProxyPoolId(pools, "smart", "tokenharbor", {
        scope: `tokenharbor::${model}`,
      });
      expect(picked).not.toBe("pool-3");
    }
  });

  it("does not leak across providers: an opencode mark never filters a tokenharbor pick", () => {
    markPoolUnfit("pool-1", "opencode::*", Date.now() + 60_000, "egress-rate-limit");

    // Round-robin advances its cursor, so assert on eligibility over a full cycle
    // rather than on whichever pool happens to come first.
    const seen = new Set();
    for (let i = 0; i < 9; i++) {
      seen.add(pickProxyPoolId(pools, "smart", "tokenharbor", {
        scope: "tokenharbor::deepseek-v4.1-flash:free",
      }));
    }
    expect(seen.has("pool-1")).toBe(true);
  });

  it("stays a no-op for providers that never reported an unfit pool (fail-open)", () => {
    // Some unrelated provider has marks on record; an untouched scope must be unaffected.
    markPoolUnfit("pool-1", "opencode::*", Date.now() + 60_000, "egress-rate-limit");

    for (let i = 0; i < 6; i++) {
      const picked = pickProxyPoolId(pools, "smart", "cline-free", {
        scope: "cline-free::deepseek-v4.1-flash",
      });
      expect(pools).toContain(picked);
    }
  });

  it("lets a provider-specific mark still win over the wildcard when it is narrower", () => {
    // jev scopes its pick to `opencode::jev`; a provider-wide mark must still filter it.
    markPoolUnfit("pool-2", "opencode::*", Date.now() + 60_000, "http 429");

    const picked = pickProxyPoolId(pools, "smart", "opencode", { scope: "opencode::jev" });
    expect(picked).not.toBe("pool-2");
  });
});
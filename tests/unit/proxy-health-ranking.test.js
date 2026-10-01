// Proxy pool health: vocabulary, candidate ranking, and the sweep that fills it in.
//
// The ranking is the part that actually changes routing. The Bright Data feeds
// behind the superproxy and proxy100 groups return a mix of working and dead
// proxies on every five-minute fetch, so a picker that ignores probe results
// round-robins evenly across a list that is roughly a quarter dead — which is where
// the ~30% "ProxyFetch: fetch failed" classifier failure rate came from.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  classifyProxyHealth,
  proxyHealthOf,
  rankPoolsByHealth,
} from "../../src/lib/network/proxyHealthRank.js";
import { pickProxyPoolId } from "../../src/lib/network/connectionProxy.js";

const GOOD = "active";
const BAD_WORDS = ["failed", "unhealthy", "dead", "degraded"];

describe("classifyProxyHealth", () => {
  it("treats only a confirmed probe as good", () => {
    expect(classifyProxyHealth("active")).toBe("good");
  });

  it.each(BAD_WORDS)("treats %s as bad", (word) => {
    expect(classifyProxyHealth(word)).toBe("bad");
  });

  it("treats never-tested as unknown rather than bad", () => {
    // 3152 of 3442 pools had never been tested. Punishing that would make a fresh
    // install unpickable.
    for (const v of ["unknown", "", null, undefined, "  ", "something-new", 42, {}]) {
      expect(classifyProxyHealth(v)).toBe("unknown");
    }
  });

  it("is case and whitespace insensitive", () => {
    expect(classifyProxyHealth("  ACTIVE ")).toBe("good");
    expect(classifyProxyHealth("Failed")).toBe("bad");
  });

  it("reads either a pool row or a bare status", () => {
    expect(proxyHealthOf({ testStatus: "active" })).toBe("good");
    expect(proxyHealthOf({ test_status: "dead" })).toBe("bad");
    expect(proxyHealthOf("active")).toBe("good");
    expect(proxyHealthOf(null)).toBe("unknown");
  });
});

describe("rankPoolsByHealth", () => {
  const ids = ["a", "b", "c", "d", "e"];

  it("keeps only the known-good pools when any exist", () => {
    const health = { a: "active", b: "failed", c: "active", d: "dead", e: "unknown" };
    expect(rankPoolsByHealth(ids, health)).toEqual(["a", "c"]);
  });

  it("prefers untested over known-bad", () => {
    // Every id gets a verdict here, so the unknown tier is exactly the one that
    // says "unknown" — otherwise the ids left out of the map would silently join
    // that tier too.
    const health = { a: "failed", b: "unknown", c: "dead", d: "failed", e: "unhealthy" };
    expect(rankPoolsByHealth(ids, health)).toEqual(["b"]);
  });

  it("falls back to known-bad only when nothing better exists", () => {
    // Degrading to a suspect pool beats failing for want of one; the next sweep
    // re-tests and promotes it back.
    const health = { a: "failed", b: "dead", c: "failed", d: "unhealthy", e: "degraded" };
    expect(rankPoolsByHealth(ids, health)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("treats a pool missing from the map as untested, not bad", () => {
    expect(rankPoolsByHealth(["a", "b"], { a: "failed" })).toEqual(["b"]);
  });

  it("is fail-open with no health data at all", () => {
    expect(rankPoolsByHealth(ids, null)).toEqual(ids);
    expect(rankPoolsByHealth(ids, {})).toEqual(ids);
    expect(rankPoolsByHealth(ids, new Map())).toEqual(ids);
  });

  it("preserves input order within a tier", () => {
    // The caller's round-robin index and sticky state are positional; re-sorting
    // within a tier would silently reshuffle them.
    const health = { e: "active", a: "active", c: "active" };
    expect(rankPoolsByHealth(ids, health)).toEqual(["a", "c", "e"]);
  });

  it("accepts a Map as well as a plain object", () => {
    const health = new Map([["a", "active"], ["b", "failed"]]);
    expect(rankPoolsByHealth(ids, health)).toEqual(["a"]);
  });

  it("handles empty and single-element input", () => {
    expect(rankPoolsByHealth([], { a: "active" })).toEqual([]);
    expect(rankPoolsByHealth(["a"], { a: "failed" })).toEqual(["a"]);
    expect(rankPoolsByHealth(null, {})).toEqual([]);
  });
});

describe("pickProxyPoolId honours pool health", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("never returns a known-dead pool while a healthy one is available", () => {
    // The property that matters: across many picks, a dead pool is not chosen.
    const poolIds = ["dead-1", "dead-2", "good-1", "good-2"];
    const health = { "dead-1": "failed", "dead-2": "dead", "good-1": "active", "good-2": "active" };
    const picked = new Set();
    for (let i = 0; i < 40; i++) {
      picked.add(pickProxyPoolId(poolIds, "round-robin", "opencode", { health }));
    }
    expect([...picked].sort()).toEqual(["good-1", "good-2"]);
  });

  it("applies under every rotation strategy, not just smart", () => {
    // The regression this guards: filtering only for strategy "smart" left
    // round-robin picking dead pools evenly across the list.
    const poolIds = ["bad", "good"];
    const health = { bad: "failed", good: "active" };
    for (const strategy of ["round-robin", "random", "smart", "none"]) {
      for (let i = 0; i < 25; i++) {
        expect(pickProxyPoolId(poolIds, strategy, "opencode", { health })).toBe("good");
      }
    }
  });

  it("still rotates across the healthy subset instead of sticking to one", () => {
    const poolIds = ["bad", "g1", "g2", "g3"];
    const health = { bad: "failed", g1: "active", g2: "active", g3: "active" };
    const picked = new Set();
    for (let i = 0; i < 30; i++) {
      picked.add(pickProxyPoolId(poolIds, "round-robin", "opencode", { health }));
    }
    expect([...picked].sort()).toEqual(["g1", "g2", "g3"]);
  });

  it("releases a sticky pool once it is marked bad", () => {
    const poolIds = ["sticky", "fresh"];
    const healthyAtFirst = { sticky: "active", fresh: "active" };
    expect(pickProxyPoolId(poolIds, "round-robin", "opencode", {
      health: healthyAtFirst, isSticky: true, stickyLimit: 99, groupId: "g1",
    })).toBe("sticky");

    // The sweep later records it as dead. Stickiness must not keep pinning traffic
    // through an egress that cannot connect.
    const nowBad = { sticky: "failed", fresh: "active" };
    for (let i = 0; i < 5; i++) {
      expect(pickProxyPoolId(poolIds, "round-robin", "opencode", {
        health: nowBad, isSticky: true, stickyLimit: 99, groupId: "g1",
      })).toBe("fresh");
    }
  });

  it("behaves exactly as before when no health is supplied", () => {
    // Fail-open: a caller that knows nothing about pool health must be unaffected.
    const poolIds = ["a", "b", "c"];
    const picked = new Set();
    for (let i = 0; i < 30; i++) {
      picked.add(pickProxyPoolId(poolIds, "round-robin", "opencode", {}));
    }
    expect(picked.size).toBe(3);
  });

  it("still returns a pool when every candidate is known-bad", () => {
    const poolIds = ["a", "b"];
    const health = { a: "failed", b: "dead" };
    expect(pickProxyPoolId(poolIds, "round-robin", "opencode", { health })).toBeTruthy();
  });

  it("respects exclusions ahead of health", () => {
    const poolIds = ["a", "b", "c"];
    const health = { a: "active", b: "active", c: "active" };
    // A pool excluded because it just failed must not come back just because it
    // looks healthy on paper.
    for (let i = 0; i < 10; i++) {
      expect(pickProxyPoolId(poolIds, "round-robin", "opencode", { health, excludeIds: ["a", "b"] })).toBe("c");
    }
  });
});

describe("the production path actually supplies health", () => {
  // Unit tests call pickProxyPoolId directly. The caller that matters is
  // resolveConnectionProxyConfig, and it can only rank on health if it forwards the
  // map — the same shape of mistake as the Jev resolveProxy that was passed to the
  // resolver and then dropped, leaving the rotation permanently disabled in
  // production while its unit test passed. Asserted at the source so the wiring
  // cannot rot silently.
  const src = readFileSync(
    new URL("../../src/lib/network/connectionProxy.js", import.meta.url),
    "utf8"
  );

  it("ranks candidates inside pickProxyPoolId", () => {
    expect(src).toMatch(/eligible = rankPoolsByHealth\(eligible,\s*health\)/);
  });

  it("accepts a health map on the opts", () => {
    expect(src).toMatch(/health\s*=\s*null/);
  });

  it("forwards the pool rows' test_status from the group map at the call site", () => {
    expect(src).toMatch(/new Map\(Array\.from\(groupPoolMap/);
    expect(src).toMatch(/pool\?\.testStatus/);
    expect(src).toMatch(/pickProxyPoolId\([\s\S]{0,400}?health: poolHealth/);
  });
});

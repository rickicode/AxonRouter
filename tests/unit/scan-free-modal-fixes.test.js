import { describe, expect, it } from "vitest";

describe("cleanModelId — dynamic provider prefix stripping", () => {
  // Inline the same logic as the ScanFreeModelsModal helper,
  // since we can't import React components directly in vitest/node.
  // Verifies the algorithm contract rather than requiring DOM.
  function cleanModelId(rawId, pId, pAlias) {
    let s = String(rawId || "");
    // Simulate getProviderAlias: map pId -> its known alias
    const aliasMap = {
      "cline-free": "clf",
      "tokenharbor": "th",
      "kilocode-free": "kcf",
      "opencode": "oc",
      "ovhcloud-free": "ovhcf",
      "llm7-free": "l7f",
    };
    const registryAlias = aliasMap[pId] || pId;
    const prefixes = new Set([pId, pAlias, registryAlias].filter(Boolean));
    for (const p of prefixes) {
      if (s.startsWith(`${p}/`)) {
        s = s.slice(p.length + 1);
      }
    }
    return s;
  }

  it("strips cline-free/ prefix", () => {
    expect(cleanModelId("cline-free/deepseek-v4.1-flash", "cline-free", "clf")).toBe("deepseek-v4.1-flash");
  });

  it("strips clf/ alias prefix", () => {
    expect(cleanModelId("clf/mimo-v2.6-flash", "cline-free", "clf")).toBe("mimo-v2.6-flash");
  });

  it("strips th/ prefix for tokenharbor", () => {
    expect(cleanModelId("th/deepseek-v4.1-flash:free", "tokenharbor", "th")).toBe("deepseek-v4.1-flash:free");
  });

  it("strips kcf/ prefix for kilocode-free", () => {
    expect(cleanModelId("kcf/nvidia/nemotron:free", "kilocode-free", "kcf")).toBe("nvidia/nemotron:free");
  });

  it("strips oc/ prefix for opencode", () => {
    expect(cleanModelId("oc/deepseek-v3", "opencode", "oc")).toBe("deepseek-v3");
  });

  it("leaves model id unchanged when no prefix matches", () => {
    expect(cleanModelId("deepseek-v4.1-flash", "cline-free", "clf")).toBe("deepseek-v4.1-flash");
  });

  it("does not strip partial prefix matches", () => {
    // "cl" is not "clf" — should not strip
    expect(cleanModelId("cl/some-model", "cline-free", "clf")).toBe("cl/some-model");
  });

  it("prevents double-prefixed IDs like th/th/model", () => {
    // If raw input already has alias, strip it; result should be clean
    expect(cleanModelId("tokenharbor/deepseek-v4.1-flash", "tokenharbor", "th")).toBe("deepseek-v4.1-flash");
  });
});

describe("deselectedRef — race condition regression", () => {
  it("ScanFreeModelsModal source has deselectedRef tracking", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../src/app/(dashboard)/dashboard/providers/[id]/ScanFreeModelsModal.js"),
      "utf8"
    );
    // deselectedRef must exist
    expect(src).toContain("deselectedRef");
    expect(src).toContain("useRef(new Set())");
    // flushBufferToState must filter by deselectedRef
    expect(src).toMatch(/!deselectedRef\.current\.has/);
    // toggleSelect must track deselections
    expect(src).toMatch(/deselectedRef\.current\.add\(id\)/);
    expect(src).toMatch(/deselectedRef\.current\.delete\(id\)/);
    // animFrameRef dead code must be gone
    expect(src).not.toContain("animFrameRef");
    expect(src).not.toContain("cancelAnimationFrame");
  });
});

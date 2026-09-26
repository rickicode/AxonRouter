import { describe, it } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

function readSrc(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

const TOPO = "src/app/(dashboard)/dashboard/usage/components/ProviderTopology.js";
const CSS = "src/app/globals.css";

describe("[axonrouter-X audit v2] P1 harden — topology graph + motion", () => {
  describe("1. Topology AT fallback (role=img + aria-label + offscreen table)", () => {
    it("container exposes role=img with dynamic aria-label", () => {
      const content = readSrc(TOPO);
      assert.ok(content.includes('role="img"'), "Missing role=img on topology container");
      assert.ok(content.includes("aria-label={statusSummary}"), "Missing dynamic aria-label");
      assert.ok(content.includes("Provider topology graph"), "aria summary must name the graph");
    });

    it("offscreen sr-only table lists provider/active/last/error status", () => {
      const content = readSrc(TOPO);
      assert.ok(content.includes('className="sr-only"'), "Missing sr-only offscreen table");
      assert.ok(content.includes('aria-label="Provider connection status"'), "Missing table aria-label");
      assert.ok(content.includes("<caption>Provider connection status</caption>"), "Missing table caption");
      assert.ok(content.includes('scope="col"'), "Missing column scope headers");
      assert.ok(content.includes('scope="row"'), "Missing row scope headers");
      assert.ok(content.includes('"active"'), "Missing active status");
      assert.ok(content.includes('"error"'), "Missing error status");
      assert.ok(content.includes('"last used"'), "Missing last-used status");
      assert.ok(content.includes('"idle"'), "Missing idle status");
      // Table lives outside role=img so screen readers can reach it
      const roleIdx = content.indexOf('role="img"');
      const tableIdx = content.indexOf('className="sr-only"');
      assert.ok(tableIdx > roleIdx, "Offscreen table must render outside the role=img container");
    });
  });

  describe("2. Controls focusable 44px + visible focus", () => {
    it("React Flow controls meet 44px touch target with focus-visible outline", () => {
      const css = readSrc(CSS);
      assert.ok(css.includes(".react-flow-controls-custom button"), "Missing controls button rule");
      assert.ok(css.includes("min-width: 44px"), "Missing 44px min-width");
      assert.ok(css.includes("min-height: 44px"), "Missing 44px min-height");
      assert.ok(css.includes(".react-flow-controls-custom button:focus-visible"), "Missing focus-visible rule");
    });

    it("Controls are not interactive-flagged (keyboard safe)", () => {
      const content = readSrc(TOPO);
      assert.ok(content.includes("showInteractive={false}"), "Controls must keep showInteractive=false");
    });
  });

  describe("3. Reduced-motion gate for feTurbulence/electric anim + spinner/pulse", () => {
    it("globals.css kills CSS-driven topology + spinner/pulse animations", () => {
      const css = readSrc(CSS);
      const guard = css.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[^}]*\}/s);
      assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"), "Missing reduced-motion media query");
      for (const cls of [".animate-spin", ".animate-pulse", ".animate-ping",
        ".topology-router-core", ".topology-router-icon", ".topology-router-label",
        ".topology-edge-kame", ".topology-edge-halo", ".topology-edge-plasma"]) {
        assert.ok(css.includes(cls), `Missing ${cls} in reduced-motion guard`);
      }
      assert.ok(guard && /animation:\s*none/.test(guard[0]), "Guard must set animation: none");
    });

    it("SMIL <animate>/<animateMotion> are gated by usePrefersReducedMotion", () => {
      const content = readSrc(TOPO);
      assert.ok(content.includes("function usePrefersReducedMotion"), "Missing reduced-motion hook");
      assert.ok(content.includes('matchMedia("(prefers-reduced-motion: reduce)")'), "Hook must read the media query");
      assert.ok(content.includes("{!reducedMotion && ("), "feTurbulence <animate> must be gated");
      assert.ok(content.includes("reducedMotion ? 0 : KAME_PARTICLE_COUNT"), "Energy orbs must be gated");
      assert.ok(content.includes("reducedMotion ? 0 : SPARK_COUNT"), "Sparks must be gated");
      assert.ok(content.includes("active && motionOK"), "Active ping indicator must be gated");
    });

    it("hook is SSR-safe and listens for preference changes", () => {
      const content = readSrc(TOPO);
      assert.ok(content.includes('typeof window === "undefined"'), "Hook must be SSR-safe");
      assert.ok(content.includes('addEventListener("change"'), "Hook must track preference changes");
    });
  });
});

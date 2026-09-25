import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OVERVIEW_SUBTABS,
  VALID_OVERVIEW_SUBTABS,
  resolveActiveSubTab,
} from "../../src/lib/usageOverview.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

describe("[axonrouter-X usage] P1 distill overview sub-tabs + lazy topology/chart (LCP)", () => {
  const readSrc = (relPath) => fs.readFileSync(path.join(ROOT, relPath), "utf-8");

  describe("1. OVERVIEW_SUBTABS Specification & Resolver", () => {
    it("exports OVERVIEW_SUBTABS array with 2 distilled views", () => {
      assert.ok(Array.isArray(OVERVIEW_SUBTABS));
      assert.equal(OVERVIEW_SUBTABS.length, 2);

      const tabValues = OVERVIEW_SUBTABS.map((t) => t.value);
      assert.deepEqual(tabValues, ["overview", "breakdown"]);
      assert.deepEqual(VALID_OVERVIEW_SUBTABS, ["overview", "breakdown"]);
    });

    it("each sub-tab has valid label and icon for technical infra tone", () => {
      for (const tab of OVERVIEW_SUBTABS) {
        assert.ok(typeof tab.value === "string" && tab.value.length > 0);
        assert.ok(typeof tab.label === "string" && tab.label.length > 0);
        assert.ok(typeof tab.icon === "string" && tab.icon.length > 0);
      }

      const overview = OVERVIEW_SUBTABS.find((t) => t.value === "overview");
      assert.equal(overview.label, "Overview");
      assert.equal(overview.icon, "dashboard");

      const breakdown = OVERVIEW_SUBTABS.find((t) => t.value === "breakdown");
      assert.equal(breakdown.label, "Breakdown");
      assert.equal(breakdown.icon, "table_chart");
    });

    it("resolveActiveSubTab resolves valid sub-tabs and safely falls back to 'overview'", () => {
      assert.equal(resolveActiveSubTab("overview"), "overview");
      assert.equal(resolveActiveSubTab("breakdown"), "breakdown");

      assert.equal(resolveActiveSubTab(""), "overview");
      assert.equal(resolveActiveSubTab(null), "overview");
      assert.equal(resolveActiveSubTab(undefined), "overview");
      assert.equal(resolveActiveSubTab("unknown_tab"), "overview");
      assert.equal(resolveActiveSubTab(123), "overview");
      assert.equal(resolveActiveSubTab("  overview  "), "overview");
      assert.equal(resolveActiveSubTab("  breakdown  "), "breakdown");
    });

    it("src/shared/components/index.js re-exports OVERVIEW_SUBTABS", () => {
      const indexSrc = readSrc("src/shared/components/index.js");
      assert.match(indexSrc, /export\s*\{\s*default\s+as\s+UsageStats,\s*OVERVIEW_SUBTABS\s*\}\s*from\s*"[./]+UsageStats";/);
    });

    it("src/shared/components/UsageStats.js exports OVERVIEW_SUBTABS and resolveActiveSubTab", () => {
      const statsSrc = readSrc("src/shared/components/UsageStats.js");
      assert.match(statsSrc, /import\s*\{\s*OVERVIEW_SUBTABS,\s*resolveActiveSubTab\s*\}\s*from\s*"@\/lib\/usageOverview";/);
      assert.match(statsSrc, /export\s*\{\s*OVERVIEW_SUBTABS,\s*resolveActiveSubTab\s*\};/);
    });
  });

  describe("2. Lazy Loading Topology & Chart for LCP Optimization", () => {
    it("UsageChart is dynamically imported to keep heavy chart chunks out of initial bundle", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      // Must not statically import UsageChart
      assert.ok(!src.includes('import UsageChart from "@/app/(dashboard)/dashboard/usage/components/UsageChart";'));
      assert.ok(!src.includes('import UsageChart from "./UsageChart";'));

      // Must use dynamic import with ssr: false and fallback skeleton
      assert.match(
        src,
        /const UsageChart = dynamic\(\s*\(\)\s*=>\s*import\("@\/app\/\(dashboard\)\/dashboard\/usage\/components\/UsageChart"\),\s*\{[^}]*ssr:\s*false/s
      );
    });

    it("ProviderTopology is dynamically imported to keep @xyflow/react out of initial bundle", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      assert.match(
        src,
        /const ProviderTopology = dynamic\(\s*\(\)\s*=>\s*import\("@\/app\/\(dashboard\)\/dashboard\/usage\/components\/ProviderTopology"\),\s*\{[^}]*ssr:\s*false/s
      );
    });

    it("Provider fetching is lazily gated by activeSubTab !== 'overview'", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      // Verify lazy gate — overview is the unified tab containing topology
      assert.match(src, /activeSubTab\s*!==\s*"overview"/);
      assert.match(src, /providersLoaded\.current/);
      // NB: fetches may carry an { signal } second arg (AbortController); regex allows either form
      assert.match(src, /fetch\("\/api\/providers[^"]*"\s*(,\s*\{[^}]*signal[^}]*\})?\s*\)/);
      assert.match(src, /fetch\("\/api\/provider-nodes"\s*(,\s*\{[^}]*signal[^}]*\})?\s*\)/);
    });
  });

  describe("3. Overview Sub-tab Routing & Conditional Rendering", () => {
    it("defaults activeSubTab to 'overview' via resolveActiveSubTab", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      assert.match(src, /const subTabFromUrl = searchParams\.get\("subtab"\);/);
      assert.match(src, /activeSubTab\s*=\s*subtabProp\s*\?\?\s*resolveActiveSubTab\(subTabFromUrl,\s*"overview"\);/);
    });

    it("updates subtab in searchParams without scrolling when user switches subtab", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      assert.match(src, /params\.set\("subtab",\s*value\)/);
      assert.match(src, /router\.replace\(`\?\$\{params\.toString\(\)\}`,\s*\{\s*scroll:\s*false\s*\}\)/);
    });

    it("conditionally renders each sub-tab section based on activeSubTab", () => {
      const src = readSrc("src/shared/components/UsageStats.js");

      // Breakdown tab renders UsageTable and dimension select
      assert.match(src, /activeSubTab\s*===\s*"breakdown"/);
      assert.match(src, /<UsageTable/);

      // Overview tab (unified) renders all sections: Trends + Topology + Live Activity
      assert.match(src, /activeSubTab\s*!==\s*"breakdown"/);
      assert.match(src, /<UsageChart/);
      assert.match(src, /<ProviderTopology/);
      assert.match(src, /<RecentRequests/);
      assert.match(src, /<RealtimeRequestsCard/);
      assert.match(src, /<RequestStream/);
    });

    it("UsagePage passes subtab to UsageStats and retains all main tabs", () => {
      const pageSrc = readSrc("src/app/(dashboard)/dashboard/usage/page.js");

      assert.match(pageSrc, /subtab=\{searchParams\.get\("subtab"\)\s*\|\|\s*undefined\}/);
      assert.ok(pageSrc.includes('{ value: "overview", label: "Overview" }'));
      assert.ok(pageSrc.includes('{ value: "logs", label: "Logs" }'));
      assert.ok(pageSrc.includes('{ value: "details", label: "Details" }'));
      assert.ok(pageSrc.includes('{ value: "analytics", label: "Analytics" }'));
    });
  });
});

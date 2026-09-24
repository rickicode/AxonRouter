import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

describe("[axonrouter-X audit] P2 optimize + animate — dynamic heavy tabs + UsageStats TimeAgo 30s + topology throttle", () => {
  const readSrc = (relPath) => fs.readFileSync(path.join(ROOT, relPath), "utf-8");

  describe("1. Usage Page Dynamic Heavy Tabs", () => {
    it("dynamically imports heavy sub-tabs (UsageStats, RequestLogger, RequestDetailsTab, AnalyticsTab) to optimize initial bundle and LCP", () => {
      const pageSrc = readSrc("src/app/(dashboard)/dashboard/usage/page.js");

      // Verify dynamic imports exist with ssr: false
      assert.match(
        pageSrc,
        /const UsageStats = dynamic\(\s*\(\)\s*=>\s*import\("@\/shared\/components\/UsageStats"\),\s*\{[^}]*ssr:\s*false/s
      );
      assert.match(
        pageSrc,
        /const RequestLogger = dynamic\(\s*\(\)\s*=>\s*import\("@\/shared\/components\/RequestLogger"\),\s*\{[^}]*ssr:\s*false/s
      );
      assert.match(
        pageSrc,
        /const RequestDetailsTab = dynamic\(\s*\(\)\s*=>\s*import\("\.\/components\/RequestDetailsTab"\),\s*\{[^}]*ssr:\s*false/s
      );
      assert.match(
        pageSrc,
        /const AnalyticsTab = dynamic\(\s*\(\)\s*=>\s*import\("\.\/components\/AnalyticsTab"\),\s*\{[^}]*ssr:\s*false/s
      );

      // Verify no static imports of these heavy components in usage/page.js
      assert.ok(!pageSrc.includes('import RequestDetailsTab from "./components/RequestDetailsTab";'));
      assert.ok(!pageSrc.includes('import AnalyticsTab from "./components/AnalyticsTab";'));
    });

    it("retains all tab routing and passes subtab to UsageStats", () => {
      const pageSrc = readSrc("src/app/(dashboard)/dashboard/usage/page.js");

      assert.match(pageSrc, /subtab=\{searchParams\.get\("subtab"\)\s*\|\|\s*undefined\}/);
      assert.ok(pageSrc.includes('{ value: "overview", label: "Overview" }'));
      assert.ok(pageSrc.includes('{ value: "logs", label: "Logs" }'));
      assert.ok(pageSrc.includes('{ value: "details", label: "Details" }'));
      assert.ok(pageSrc.includes('{ value: "analytics", label: "Analytics" }'));
    });
  });

  describe("2. TimeAgo 30s Throttle", () => {
    it("UsageStats TimeAgo throttles tick interval to 30000ms (30s)", () => {
      const statsSrc = readSrc("src/shared/components/UsageStats.js");

      assert.match(
        statsSrc,
        /function TimeAgo\(\{ timestamp \}\)\s*\{[\s\S]*?setInterval\([\s\S]*?,\s*30000\)/
      );
      assert.ok(!/function TimeAgo\(\{ timestamp \}\)\s*\{[\s\S]*?setInterval\([\s\S]*?,\s*1000\)/.test(statsSrc));
    });

    it("RealtimeRequestsCard TimeAgo is throttled to 30000ms (30s)", () => {
      const cardSrc = readSrc("src/app/(dashboard)/dashboard/usage/components/RealtimeRequestsCard.js");

      assert.match(
        cardSrc,
        /function TimeAgo\(\{ timestamp \}\)\s*\{[\s\S]*?setInterval\([\s\S]*?,\s*30000\)/
      );
    });
  });

  describe("3. ProviderTopology Animation & Throttle Hardening", () => {
    it("throttles FE_ACTIVE_TICK_MS in ProviderTopology to reduce unneeded layout refits", () => {
      const topoSrc = readSrc("src/app/(dashboard)/dashboard/usage/components/ProviderTopology.js");

      assert.match(topoSrc, /const FE_ACTIVE_TICK_MS = 3000;/);
      assert.match(topoSrc, /setInterval\(\(\) => setClock\(Date\.now\(\)\),\s*FE_ACTIVE_TICK_MS\)/);
    });

    it("respects prefers-reduced-motion in globals.css for topology animations", () => {
      const cssSrc = readSrc("src/app/globals.css");

      assert.match(
        cssSrc,
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.topology-router-core[^}]*animation:\s*none\s*!important/s
      );
      assert.match(
        cssSrc,
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.topology-edge-kame[^}]*animation:\s*none\s*!important/s
      );
    });
  });
});

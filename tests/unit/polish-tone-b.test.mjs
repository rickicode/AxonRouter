import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../");

describe("Polish Visual & IA Verification (Tone B infra, logs tab, mobile 360px)", () => {
  const readSrc = (relPath) => fs.readFileSync(path.join(rootDir, relPath), "utf-8");

  describe("1. Colorize & Tailscale token check", () => {
    it("TailscaleCard and endpoint components do not use hardcoded gradient or text-white! overrides", () => {
      const tsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TailscaleCard.js");
      assert.ok(!tsContent.includes("from-indigo-500"));
      assert.ok(!tsContent.includes("to-purple-500"));
      assert.ok(!tsContent.includes("text-white!"));
    });
  });

  describe("2. Clarify Usage tabs: Logs tab present in SegmentedControl", () => {
    it("UsagePage includes 'logs' option in SegmentedControl", () => {
      const usageContent = readSrc("src/app/(dashboard)/dashboard/usage/page.js");
      assert.ok(usageContent.includes('{ value: "logs", label: "Logs" }'));
      assert.ok(usageContent.includes('activeTab === "logs" && <RequestLogger />'));
    });
  });

  describe("3. Typeset & Tone B: Monospace URLs, keys, logs, and prominent status chips", () => {
    it("EndpointRow has responsive flex-col sm:flex-row and font-mono input", () => {
      const rowContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/EndpointRow.js");
      assert.ok(rowContent.includes("flex-col sm:flex-row"));
      assert.ok(rowContent.includes("font-mono text-sm"));
    });

    it("EndpointUrlsCard, TunnelCard, and TailscaleCard have pulsing dots and prominent status chips", () => {
      const urlsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/EndpointUrlsCard.js");
      assert.ok(urlsContent.includes("animate-ping"));
      assert.ok(urlsContent.includes("RECONNECTING"));

      const tunnelContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TunnelCard.js");
      assert.ok(tunnelContent.includes("animate-ping"));

      const tsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TailscaleCard.js");
      assert.ok(tsContent.includes("animate-ping"));
    });
  });

  describe("4. Mobile 360px layout", () => {
    it("EndpointUrlsCard wraps endpoint rows responsively without breaking at 360px", () => {
      const urlsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/EndpointUrlsCard.js");
      assert.ok(urlsContent.includes("flex-col sm:flex-row"));
    });

    it("TailscaleCard and TunnelCard url rows use flex-col sm:flex-row for mobile", () => {
      const tsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TailscaleCard.js");
      assert.ok(tsContent.includes("flex-col sm:flex-row"));

      const tunnelContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TunnelCard.js");
      assert.ok(tunnelContent.includes("flex-col sm:flex-row"));
    });
  });

  describe("5. Clarify inline: requireApiKey vs requireLogin subtitles", () => {
    it("ApiKeysCard explains model endpoints protection clearly", () => {
      const apiKeysContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/ApiKeysCard.js");
      assert.ok(apiKeysContent.includes("Protects model endpoints (/v1/*)"));
      assert.ok(apiKeysContent.includes("Does not gate dashboard UI login"));
    });

    it("Profile security section explains dashboard UI protection clearly", () => {
      const profileContent = readSrc("src/app/(dashboard)/dashboard/settings/page.js");
      assert.ok(profileContent.includes("Protects dashboard web UI"));
      assert.ok(profileContent.includes("Does not affect model API key verification"));
    });
  });

  describe("6. Adapt: Tailscale auth popup with fallback redirect for mobile", () => {
    it("TailscaleCard defines openTailscaleAuth with window.open and fallback window.location.href", () => {
      const tsContent = readSrc("src/app/(dashboard)/dashboard/endpoint/components/TailscaleCard.js");
      assert.ok(tsContent.includes("openTailscaleAuth"));
      assert.ok(tsContent.includes("window.open("));
      assert.ok(tsContent.includes("window.location.href = url"));
    });
  });
});

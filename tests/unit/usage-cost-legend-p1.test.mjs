import { describe, it } from "node:test";
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

const CARDS = "src/app/(dashboard)/dashboard/usage/components/OverviewCards.js";
const TOPO = "src/app/(dashboard)/dashboard/usage/components/ProviderTopology.js";

describe("[axonrouter-X usage] P1 clarify cost help + legend", () => {
  describe("1. Est Cost tooltip + breakdown + billing link + exact-rate note", () => {
    it("imports and renders Tooltip next to Est. Cost label", () => {
      const content = readSrc(CARDS);
      assert.ok(
        content.includes('import Tooltip from "@/shared/components/Tooltip"'),
        "Missing Tooltip import",
      );
      assert.ok(content.includes("<Tooltip"), "Est. Cost must render <Tooltip>");
      assert.ok(content.includes("costBreakdownTip"), "Tooltip must carry cost breakdown text");
    });

    it("tooltip text carries Input/Cached/Output split + exact-rate note", () => {
      const content = readSrc(CARDS);
      assert.ok(content.includes("inputCost"), "Missing input cost split");
      assert.ok(content.includes("cachedCost"), "Missing cached cost split");
      assert.ok(content.includes("outputCost"), "Missing output cost split");
      assert.ok(
        content.includes("Exact rate from Settings > Pricing") ||
          content.includes("exact-rate"),
        "Missing exact-rate note",
      );
    });

    it("renders visible breakdown line + billing docs link", () => {
      const content = readSrc(CARDS);
      assert.ok(
        content.includes("billing docs"),
        "Missing billing docs link text",
      );
      assert.ok(
        content.includes("/dashboard/settings/pricing"),
        "Billing link must point at pricing settings",
      );
      assert.ok(content.includes("Estimated, not actual billing"), "Missing est disclaimer");
    });
  });

  describe("2. ProviderTopology legend + keyboard + badge a11y", () => {
    it("renders edge-color legend for active/last/error/idle", () => {
      const content = readSrc(TOPO);
      assert.ok(content.includes('data-testid="topology-legend"'), "Missing legend block");
      assert.ok(content.includes("Active"), "Legend must name Active");
      assert.ok(content.includes("Last used"), "Legend must name Last used");
      assert.ok(content.includes("Error"), "Legend must name Error");
      assert.ok(content.includes("Idle"), "Legend must name Idle");
      assert.ok(content.includes("bg-info"), "Legend must show active color");
      assert.ok(content.includes("bg-warning"), "Legend must show last-used color");
      assert.ok(content.includes("bg-danger"), "Legend must show error color");
    });

    it("provider nodes are keyboard focusable with visible focus ring", () => {
      const content = readSrc(TOPO);
      assert.ok(content.includes("tabIndex={0}"), "Nodes must be keyboard focusable");
      assert.ok(
        content.includes("focus-visible:ring-2"),
        "Nodes must have visible focus ring",
      );
      assert.ok(
        content.includes("aria-label={`${label}"),
        "Nodes must expose an aria-label",
      );
    });

    it("router active-count badge exposes role=status + aria-label", () => {
      const content = readSrc(TOPO);
      assert.ok(content.includes('role="status"'), "Badge must have role=status");
      assert.ok(
        content.includes("active requests"),
        "Badge must label its active-request count",
      );
    });
  });
});

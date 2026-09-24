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

describe("[axonrouter-X audit] P1 harden keyboard a11y — tablist roving + sortable th button + Tooltip/Combobox/chart ARIA", () => {
  describe("1. SegmentedControl & Tablist Roving Tabindex", () => {
    it("SegmentedControl implements WAI-ARIA tablist roving tabindex with arrow keys and Home/End", () => {
      const content = readSrc("src/shared/components/SegmentedControl.js");

      assert.ok(content.includes('role="tablist"'), "Missing role='tablist'");
      assert.ok(content.includes('aria-orientation="horizontal"'), "Missing aria-orientation='horizontal'");
      assert.ok(content.includes('role="tab"'), "Missing role='tab'");
      assert.ok(content.includes("aria-selected={isSelected}"), "Missing aria-selected");
      assert.ok(content.includes("tabIndex={isTabStop ? 0 : -1}"), "Missing roving tabIndex");
      assert.ok(content.includes("ArrowRight"), "Missing ArrowRight navigation");
      assert.ok(content.includes("ArrowLeft"), "Missing ArrowLeft navigation");
      assert.ok(content.includes("ArrowDown"), "Missing ArrowDown navigation");
      assert.ok(content.includes("ArrowUp"), "Missing ArrowUp navigation");
      assert.ok(content.includes('"Home"'), "Missing Home key navigation");
      assert.ok(content.includes('"End"'), "Missing End key navigation");
      assert.ok(content.includes("focus-visible:ring-"), "Missing focus-visible indicator ring");
    });

    it("HostSetupCommand implements accessible tablist with roving keyboard navigation", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/cli-tools/components/HostSetupCommand.js");

      assert.ok(content.includes('role="tablist"'), "HostSetupCommand missing role='tablist'");
      assert.ok(content.includes('role="tab"'), "HostSetupCommand missing role='tab'");
      assert.ok(content.includes('aria-selected={activeTab === "bash"}'), "HostSetupCommand missing aria-selected for bash");
      assert.ok(content.includes('aria-selected={activeTab === "ps1"}'), "HostSetupCommand missing aria-selected for ps1");
      assert.ok(content.includes('tabIndex={activeTab === "bash" ? 0 : -1}'), "HostSetupCommand missing roving tabIndex for bash");
      assert.ok(content.includes('tabIndex={activeTab === "ps1" ? 0 : -1}'), "HostSetupCommand missing roving tabIndex for ps1");
      assert.ok(content.includes("onKeyDown="), "HostSetupCommand missing onKeyDown navigation");
    });

    it("Proxy pools page implements accessible tablist with roving keyboard navigation", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/proxy-pools/page.js");

      assert.ok(content.includes('role="tablist"'), "proxy-pools missing role='tablist'");
      assert.ok(content.includes('role="tab"'), "proxy-pools missing role='tab'");
      assert.ok(content.includes('aria-selected={activeTab === "pools"}'), "proxy-pools missing aria-selected for pools");
      assert.ok(content.includes('aria-selected={activeTab === "groups"}'), "proxy-pools missing aria-selected for groups");
      assert.ok(content.includes('tabIndex={activeTab === "pools" ? 0 : -1}'), "proxy-pools missing roving tabIndex for pools");
      assert.ok(content.includes('tabIndex={activeTab === "groups" ? 0 : -1}'), "proxy-pools missing roving tabIndex for groups");
      assert.ok(content.includes("onKeyDown="), "proxy-pools missing onKeyDown navigation");
    });

    it("ProviderLimits status filter tabs implement roving tablist with arrow keys and Home/End", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/usage/components/ProviderLimits/index.js");

      assert.ok(content.includes('role="tablist"'), "ProviderLimits status tabs missing role='tablist'");
      assert.ok(content.includes('role="tab"'), "ProviderLimits status tabs missing role='tab'");
      assert.ok(content.includes("aria-selected={isSelected}"), "ProviderLimits status tabs missing aria-selected");
      assert.ok(content.includes("tabIndex={isSelected ? 0 : -1}"), "ProviderLimits status tabs missing roving tabIndex");
      assert.ok(content.includes("ArrowRight"), "ProviderLimits status tabs missing ArrowRight");
      assert.ok(content.includes("ArrowLeft"), "ProviderLimits status tabs missing ArrowLeft");
      assert.ok(content.includes('"Home"'), "ProviderLimits status tabs missing Home");
      assert.ok(content.includes('"End"'), "ProviderLimits status tabs missing End");
    });
  });

  describe("2. Sortable Table Header (th) Buttons", () => {
    it("UsageTable wraps sortable th headers in accessible interactive buttons", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/usage/components/UsageTable.js");

      assert.ok(content.includes("aria-sort={sortState}"), "UsageTable th must have aria-sort");
      assert.ok(/<th\s+[^>]*scope="col"/.test(content), "UsageTable th must have scope='col'");
      assert.ok(content.includes('<button\n                      type="button"\n                      onClick={() => onToggleSort(') || content.includes('<button type="button" onClick={() => onToggleSort('), "UsageTable th must contain sortable button");
      assert.ok(content.includes("aria-label={`Sort by ${col.label}"), "UsageTable sort button must have descriptive aria-label");
      assert.ok(content.includes("focus-visible:ring-"), "UsageTable sort button must have focus-visible ring");
    });
  });

  describe("3. Tooltip ARIA & Keyboard Hardening", () => {
    it("Tooltip implements Enter/Space toggle for icon triggers, aria-describedby linkage, and Esc dismiss", () => {
      const content = readSrc("src/shared/components/Tooltip.js");

      assert.ok(content.includes('role="tooltip"'), "Tooltip missing role='tooltip'");
      assert.ok(content.includes("aria-describedby={text ? id : undefined}"), "Tooltip missing text-conditional aria-describedby");
      assert.ok(content.includes('e.key === "Escape"'), "Tooltip missing Esc dismiss");
      assert.ok(content.includes('e.key === "Enter" || e.key === " "'), "Tooltip missing Enter/Space keyboard toggle");
      assert.ok(content.includes("aria-expanded="), "Tooltip missing aria-expanded for interactive trigger");
      assert.ok(content.includes("aria-hidden={dismissed ? true : undefined}"), "Tooltip missing aria-hidden on dismissed state");
      assert.ok(content.includes("focus-within:opacity-100"), "Tooltip missing focus-within visibility");
    });
  });

  describe("4. Combobox ARIA & Keyboard Navigation", () => {
    it("Combobox implements ARIA 1.2 compliant combobox and listbox attributes", () => {
      const content = readSrc("src/shared/components/Combobox.js");

      assert.ok(content.includes('role="combobox"'), "Combobox missing role='combobox'");
      assert.ok(content.includes('aria-autocomplete="list"'), "Combobox missing aria-autocomplete='list'");
      assert.ok(content.includes("aria-controls={isOpen ? listboxId : undefined}"), "Combobox aria-controls must be present only when listbox is open");
      assert.ok(content.includes("aria-activedescendant={"), "Combobox missing aria-activedescendant");
      assert.ok(content.includes("aria-invalid={Boolean(error)}"), "Combobox missing aria-invalid");
      assert.ok(content.includes("aria-describedby={describedBy}"), "Combobox missing aria-describedby error/hint linkage");
      assert.ok(content.includes('role="listbox"'), "Combobox missing role='listbox'");
      assert.ok(content.includes("aria-label={label || ariaLabel || placeholder || \"Options\"}"), "Combobox listbox missing aria-label");
      assert.ok(content.includes('role="option"'), "Combobox options missing role='option'");
      assert.ok(content.includes('role="status"'), "Combobox empty message missing role='status'");
      assert.ok(content.includes('aria-live="polite"'), "Combobox empty message missing aria-live='polite'");
      assert.ok(content.includes("e.altKey && e.key === \"ArrowDown\""), "Combobox missing Alt+ArrowDown open");
      assert.ok(content.includes("e.altKey && e.key === \"ArrowUp\""), "Combobox missing Alt+ArrowUp close");
    });
  });

  describe("5. Chart ARIA & Accessible Descriptions", () => {
    it("UsageChart implements focusable region with aria-label and sr-only summary", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/usage/components/UsageChart.js");

      assert.ok(content.includes('role="region"'), "UsageChart missing role='region'");
      assert.ok(content.includes("aria-label={`Usage trend chart for ${period} period showing"), "UsageChart missing descriptive aria-label");
      assert.ok(content.includes("tabIndex={0}"), "UsageChart missing tabIndex={0}");
      assert.ok(content.includes('className="sr-only"'), "UsageChart missing sr-only summary");
      assert.ok(content.includes('role="status"'), "UsageChart loading/empty missing role='status'");
    });

    it("AnalyticsTrendChart implements focusable region with aria-label and sr-only summary", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/usage/components/AnalyticsTrendChart.js");

      assert.ok(content.includes('role="region"'), "AnalyticsTrendChart missing role='region'");
      assert.ok(content.includes("aria-label={`${title} trend chart`}"), "AnalyticsTrendChart missing aria-label");
      assert.ok(content.includes("tabIndex={0}"), "AnalyticsTrendChart missing tabIndex={0}");
      assert.ok(content.includes('className="sr-only"'), "AnalyticsTrendChart missing sr-only summary");
      assert.ok(content.includes('role="status"'), "AnalyticsTrendChart empty missing role='status'");
    });

    it("GlobalAnalyticsChart implements focusable region with aria-label and sr-only summary", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/usage/components/GlobalAnalyticsChart.js");

      assert.ok(content.includes('role="region"'), "GlobalAnalyticsChart missing role='region'");
      assert.ok(content.includes("aria-label={`Global telemetry analytics chart showing ${viewMode}`}"), "GlobalAnalyticsChart missing aria-label");
      assert.ok(content.includes("tabIndex={0}"), "GlobalAnalyticsChart missing tabIndex={0}");
      assert.ok(content.includes('className="sr-only"'), "GlobalAnalyticsChart missing sr-only summary");
      assert.ok(content.includes('role="status"'), "GlobalAnalyticsChart empty missing role='status'");
    });

    it("PxpipeClient timeline chart implements focusable region with aria-label and sr-only summary", () => {
      const content = readSrc("src/app/(dashboard)/dashboard/pxpipe/PxpipeClient.js");

      assert.ok(content.includes('role="region"'), "PxpipeClient missing role='region'");
      assert.ok(content.includes('aria-label="Tokens saved timeline chart"'), "PxpipeClient missing aria-label");
      assert.ok(content.includes("tabIndex={0}"), "PxpipeClient missing tabIndex={0}");
      assert.ok(content.includes('className="sr-only"'), "PxpipeClient missing sr-only summary");
      assert.ok(content.includes('role="status"'), "PxpipeClient empty missing role='status'");
    });
  });
});

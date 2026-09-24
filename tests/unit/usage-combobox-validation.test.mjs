import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateFilterDimension,
  validateProviderFilter,
  validateModelFilter,
  validateAnalyticsFilters,
} from "../../src/lib/analyticsFilters.js";

import {
  validateProviderFilter as reexportedProviderFilter,
  validateModelFilter as reexportedModelFilter,
  fetchAnalytics,
  analyticsUrl,
} from "../../src/app/(dashboard)/dashboard/usage/components/analyticsData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

describe("[axonrouter-X usage] P0 harden exact-ID → searchable provider/model combobox + validation", () => {
  describe("1. Dimension & Filter Validation Logic", () => {
    it("accepts valid dimensions and empty/undefined optional inputs", () => {
      assert.deepEqual(validateFilterDimension("openai", 64, "provider"), { valid: true });
      assert.deepEqual(validateFilterDimension("", 64, "provider"), { valid: true });
      assert.deepEqual(validateFilterDimension(undefined, 64, "provider"), { valid: true });
      assert.deepEqual(validateFilterDimension(null, 64, "provider"), { valid: true });
      assert.deepEqual(validateProviderFilter("anthropic"), { valid: true });
      assert.deepEqual(validateModelFilter("claude-3-5-sonnet-20241022"), { valid: true });
      assert.deepEqual(reexportedProviderFilter("gemini"), { valid: true });
      assert.deepEqual(reexportedModelFilter("gemini-1.5-pro"), { valid: true });
    });

    it("rejects non-string inputs", () => {
      assert.equal(validateFilterDimension(12345, 64, "provider").valid, false);
      assert.match(validateFilterDimension(12345, 64, "provider").error, /must be a string/);
    });

    it("enforces length ceilings (64 for provider, 256 for model)", () => {
      const p64 = "a".repeat(64);
      const p65 = "a".repeat(65);
      assert.deepEqual(validateProviderFilter(p64), { valid: true });
      assert.equal(validateProviderFilter(p65).valid, false);
      assert.match(validateProviderFilter(p65).error, /64 characters/);

      const m256 = "m".repeat(256);
      const m257 = "m".repeat(257);
      assert.deepEqual(validateModelFilter(m256), { valid: true });
      assert.equal(validateModelFilter(m257).valid, false);
      assert.match(validateModelFilter(m257).error, /256 characters/);
    });

    it("rejects leading or trailing whitespace", () => {
      assert.equal(validateProviderFilter(" openai").valid, false);
      assert.equal(validateProviderFilter("openai ").valid, false);
      assert.match(validateProviderFilter(" openai").error, /leading or trailing whitespace/);

      assert.equal(validateModelFilter(" gpt-4o").valid, false);
      assert.equal(validateModelFilter("gpt-4o ").valid, false);
      assert.match(validateModelFilter(" gpt-4o").error, /leading or trailing whitespace/);
    });

    it("rejects control characters in dimensions", () => {
      assert.equal(validateProviderFilter("open\x00ai").valid, false);
      assert.equal(validateProviderFilter("open\x1fai").valid, false);
      assert.match(validateProviderFilter("open\x00ai").error, /illegal control characters/);

      assert.equal(validateModelFilter("gpt\x7f4o").valid, false);
      assert.match(validateModelFilter("gpt\x7f4o").error, /illegal control characters/);
    });

    it("validateAnalyticsFilters enforces provider and model validation on server payload", () => {
      const valid = validateAnalyticsFilters({
        provider: "openai",
        model: "gpt-4o-mini",
        timeFrom: "2026-09-08T00:00:00Z",
        timeTo: "2026-09-09T00:00:00Z",
      });
      assert.equal(valid.provider, "openai");
      assert.equal(valid.model, "gpt-4o-mini");

      assert.throws(
        () =>
          validateAnalyticsFilters({
            provider: "a".repeat(65),
            timeFrom: "2026-09-08T00:00:00Z",
            timeTo: "2026-09-09T00:00:00Z",
          }),
        /Invalid provider/,
      );

      assert.throws(
        () =>
          validateAnalyticsFilters({
            model: "m".repeat(257),
            timeFrom: "2026-09-08T00:00:00Z",
            timeTo: "2026-09-09T00:00:00Z",
          }),
        /Invalid model/,
      );

      assert.throws(
        () =>
          validateAnalyticsFilters({
            provider: " leading-space",
            timeFrom: "2026-09-08T00:00:00Z",
            timeTo: "2026-09-09T00:00:00Z",
          }),
        /Invalid provider/,
      );
    });
  });

  describe("2. fetchAnalytics error extraction", () => {
    it("extracts specific JSON error message when API responds with 400", async () => {
      const mockFetcher = async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid provider: maximum 64 characters exceeded" }),
      });

      await assert.rejects(
        () => fetchAnalytics({ period: "24h", provider: "bad" }, null, mockFetcher),
        /Invalid provider: maximum 64 characters exceeded/,
      );
    });
  });

  describe("3. Combobox Component Implementation & Exports", () => {
    it("src/shared/components/Combobox.js exists and implements accessible combobox", () => {
      const comboboxPath = path.join(ROOT, "src/shared/components/Combobox.js");
      assert.equal(fs.existsSync(comboboxPath), true);

      const content = fs.readFileSync(comboboxPath, "utf8");
      assert.match(content, /role="combobox"/);
      assert.match(content, /aria-expanded=/);
      assert.match(content, /aria-haspopup="listbox"/);
      assert.match(content, /role="listbox"/);
      assert.match(content, /role="option"/);
      assert.match(content, /aria-selected=/);
      assert.match(content, /allowCustom/);
      assert.match(content, /clearable/);
      assert.match(content, /handleKeyDown/);
      assert.match(content, /ArrowDown/);
      assert.match(content, /ArrowUp/);
      assert.match(content, /Enter/);
      assert.match(content, /Escape/);
    });

    it("src/shared/components/index.js exports Combobox", () => {
      const indexPath = path.join(ROOT, "src/shared/components/index.js");
      const content = fs.readFileSync(indexPath, "utf8");
      assert.match(content, /export\s*\{\s*default\s+as\s+Combobox\s*\}\s*from\s*["']\.\/Combobox["']/);
    });
  });

  describe("4. AnalyticsTab exact-ID eradication and Combobox integration", () => {
    it("AnalyticsTab has ZERO exact-ID placeholders", () => {
      const tabPath = path.join(
        ROOT,
        "src/app/(dashboard)/dashboard/usage/components/AnalyticsTab.js",
      );
      const content = fs.readFileSync(tabPath, "utf8");
      assert.doesNotMatch(content, /Provider \(exact ID\)/i);
      assert.doesNotMatch(content, /Model \(exact ID\)/i);
      assert.doesNotMatch(content, /exact ID/i);
    });

    it("AnalyticsTab uses Combobox for both Provider and Model filters", () => {
      const tabPath = path.join(
        ROOT,
        "src/app/(dashboard)/dashboard/usage/components/AnalyticsTab.js",
      );
      const content = fs.readFileSync(tabPath, "utf8");
      assert.match(content, /import\s+Combobox\s+from\s+["']@\/shared\/components\/Combobox["']/);
      assert.match(content, /id="analytics-provider-filter"/);
      assert.match(content, /id="analytics-model-filter"/);
      assert.match(content, /options=\{providerOptions\}/);
      assert.match(content, /options=\{modelOptions\}/);
      assert.match(content, /handleProviderChange/);
      assert.match(content, /handleModelChange/);
    });

    it("AnalyticsTab integrates client-side validation and prevents bad fetch", () => {
      const tabPath = path.join(
        ROOT,
        "src/app/(dashboard)/dashboard/usage/components/AnalyticsTab.js",
      );
      const content = fs.readFileSync(tabPath, "utf8");
      assert.match(content, /validateProviderFilter/);
      assert.match(content, /validateModelFilter/);
      assert.match(content, /providerValidation/);
      assert.match(content, /modelValidation/);
      assert.match(content, /hasFilterError/);
    });
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

describe("Morph settings UI source", () => {
  async function readMorphPageClientSource() {
    const pagePath = path.resolve(
      import.meta.dirname,
      "../../src/app/(dashboard)/dashboard/morph/MorphPageClient.tsx"
    );

    return fs.readFile(pagePath, "utf8");
  }

  async function readMorphInstructionsCardSource() {
    const pagePath = path.resolve(
      import.meta.dirname,
      "../../src/app/(dashboard)/dashboard/morph/MorphInstructionsCard.tsx"
    );

    return fs.readFile(pagePath, "utf8");
  }

  it("hides the editable baseUrl input and keeps local routing guidance", async () => {
    const source = await readMorphPageClientSource();

    expect(source).not.toContain('handleFieldChange("baseUrl", event.target.value)');
    expect(source).not.toContain('placeholder="https://api.morphllm.com"');
    expect(source).toContain("Connection Info");
    expect(source).toContain("Available endpoints");
    expect(source).toContain("Manage the single Morph configuration surface");
  });

  it("includes Morph default instructions controls", async () => {
    const source = await readMorphPageClientSource();
    const cardSource = await readMorphInstructionsCardSource();

    expect(cardSource).toContain("Morph Default Instructions");
    expect(cardSource).toContain("morph-instructions.md");
  });

  it("includes multi-key editor controls", async () => {
    const source = await readMorphPageClientSource();

    expect(source).toContain("handleAddApiKey");
    expect(source).toContain("handleRemoveApiKey");
    expect(source).toContain("parseBulkMorphApiKeys");
    expect(source).toContain("Bulk import Morph API keys");
    expect(source).toContain("email|apikey");
    expect(source).toContain('fetch("/api/morph/test-key"');
    expect(source).toContain("Test");
    expect(source).toContain("Test all");
    expect(source).toContain("Add key");
    expect(source).toContain("Remove");
    expect(source).toContain("validate them immediately");
    expect(source).toContain("Checking key status...");
    expect(source).toContain("No API keys added yet.");
    expect(source).toContain("paginatedApiKeys");
  });

  it("includes the round-robin toggle", async () => {
    const source = await readMorphPageClientSource();

    expect(source).toContain('type="checkbox"');
    expect(source).toContain('checked={morphSettings.roundRobinEnabled}');
    expect(source).toContain("Round-robin keys");
  });

  it("includes the fast apply model selector", async () => {
    const source = await readMorphPageClientSource();

    expect(source).toContain('value={morphSettings.fastApplyModel}');
    expect(source).toContain("Fast Apply model");
    expect(source).toContain('morph-v3-large');
    expect(source).toContain('Choose which Morph Apply model should power internal fast-apply interception');
  });

  it("lists all five Morph route paths in source", async () => {
    const source = await readMorphPageClientSource();

    expect(source).toContain('path: "/morphllm/v1/chat/completions"');
    expect(source).toContain('path: "/morphllm/v1/compact"');
    expect(source).toContain('path: "/morphllm/v1/models"');
    expect(source).toContain('target: "Morph native chat facade"');
    expect(source).toContain('target: "Morph compact"');
    expect(source).toContain('target: "Morph model discovery"');
  });

  it("includes help text about key 0 being primary", async () => {
    const source = await readMorphPageClientSource();

    expect(source).toContain("When round-robin is off, the first active email stays primary and later emails are failover-only.");
  });

  it("adds a dedicated Usage tab and isolated Morph usage copy", async () => {
    const source = await readMorphPageClientSource();
    const byEmailSection = source.slice(
      source.indexOf('>By email</h3>'),
      source.indexOf('>Request logs</h3>') === -1 ? undefined : source.indexOf('>Request logs</h3>')
    );

    expect(source).toContain('<TabsTrigger value="usage">Usage</TabsTrigger>');
    expect(source).toContain("Morph usage");
    expect(source).toContain('fetchJson(`/api/morph/usage/stats?period=${usagePeriod}`, { signal })');
    expect(source).toContain('fetchJson("/api/morph/usage/requests?limit=200", { signal })');
    expect(source).toContain("Combined Morph Core");
    expect(source).toContain("and Fast Models");
    expect(source).toContain("By email");
    expect(source).toContain("By email");
    expect(source).toContain("Search...");
    expect(source).toContain("String(value?.inputTokens ?? \"\").toLowerCase()");
    expect(source).toContain("String(value?.outputTokens ?? \"\").toLowerCase()");
    expect(source).toContain("String(value?.requests ?? \"\").toLowerCase()");
    expect(source).toContain("String(value?.credits ?? \"\").toLowerCase()");
    expect(source).toContain("fmtNumber(value?.inputTokens).toLowerCase()");
    expect(source).toContain("fmtNumber(value?.outputTokens).toLowerCase()");
    expect(source).toContain("fmtNumber(value?.requests).toLowerCase()");
    expect(source).toContain("fmtCredits(value?.credits).toLowerCase()");
    expect(source).toContain("Request logs");
    expect(source).toContain("Auto-refresh");
    expect(byEmailSection).toContain("Email");
    expect(source).toContain("filteredEmailUsageEntries.length");
    expect(source).toContain("value.apiKeyLabel || key");
    expect(source).toContain("fmtNumber(value.inputTokens)");
    expect(source).toContain("fmtNumber(value.outputTokens)");
    expect(byEmailSection).toContain("Email</th>");
    expect(byEmailSection).toContain(">In</th>");
    expect(byEmailSection).toContain(">Out</th>");
    expect(byEmailSection).toContain(">Req</th>");
    expect(byEmailSection).toContain(">Credits</th>");
    expect(byEmailSection).not.toContain("<th className=\"py-2\">Capability</th>");
    expect(source).not.toContain("<th className=\"px-4 py-3\">Entrypoint</th>");
    expect(source).toContain("chevronleft");
    expect(source).toContain("chevronright");
  });

  it("explains that Morph usage includes both Core and Fast Models", async () => {
    const source = await readMorphPageClientSource();

    expect(source).toContain("Morph usage");
    expect(source).toContain("Combined Morph Core");
    expect(source).toContain("and Fast Models");
    expect(source).toContain("Combined Morph Core");
  });

  it("rounds displayed Morph credits and keeps validation focused on having keys present", async () => {
    const source = await readMorphPageClientSource();

    expect(source).toContain("maximumFractionDigits: 0");
    expect(source).toContain('return "Add at least one Morph API key.";');
    expect(source).toContain("await persistMorphSettings(nextSettings);");
    expect(source).toContain('status: entry.status || "inactive"');
    expect(source).not.toContain("Save Morph settings");
    expect(source).not.toContain('return "Base URL is required."');
  });
});

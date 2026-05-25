import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("broader header search parity", () => {
  it("wires shared header search into providers and cli tools pages", async () => {
    const providersSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/dashboard/providers/page.tsx"),
      "utf8"
    );
    const cliToolsSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/dashboard/cli-tools/CLIToolsPageClient.tsx"),
      "utf8"
    );

    expect(providersSource).toContain("useHeaderSearchStore");
    expect(providersSource).toContain("filteredOauthProviders");
    expect(providersSource).toContain("filteredApiKeyProviders");
    expect(cliToolsSource).toContain("useHeaderSearchStore");
    expect(cliToolsSource).toContain("No CLI tools match current search.");
    expect(cliToolsSource).toContain("matchesToolSearch");
    expect(cliToolsSource).toContain("Visible Tools");
    expect(cliToolsSource).toContain("Configured");
  });
});

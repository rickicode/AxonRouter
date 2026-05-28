import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("caveman page wiring", () => {
  it("adds page source and dashboard navigation entry", async () => {
    const pageSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/app/caveman/CavemanPageClient.tsx"),
      "utf8"
    );
    const routeSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/app/caveman/page.tsx"),
      "utf8"
    );
    const navSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/shared/constants/dashboardNavigation.ts"),
      "utf8"
    );

    expect(routeSource).toContain('pageTitle("Caveman")');
    expect(pageSource).toContain("Global Mode");
    expect(pageSource).toContain("Prompt Preview");
    expect(pageSource).toContain("Test Playground");
    expect(pageSource).toContain("Runtime Notes");
    expect(pageSource).toContain("Enable Caveman globally");
    expect(pageSource).toContain("Apply to native passthrough clients");
    expect(pageSource).toContain("Save Caveman settings");
    expect(pageSource).toContain("Caveman settings saved.");
    expect(pageSource).toContain("queryKeys.settings()");
    expect(pageSource).toContain('fetchJson<any>("/api/settings"');
    expect(pageSource).toContain('body: JSON.stringify({ caveman: nextDraft })');
    expect(pageSource).toContain("CAVEMAN_PROMPTS[effectiveDraft.level]");
    expect(pageSource).toContain("Caveman lite preview");
    expect(pageSource).toContain("Caveman ultra preview");
    expect(navSource).toContain('href: "/app/caveman"');
    expect(navSource).toContain('title: "Caveman"');
  });
});

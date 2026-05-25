import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("skills page wiring", () => {
  it("adds skills constants, page, and dashboard navigation", async () => {
    const constantsSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/shared/constants/skills.ts"),
      "utf8"
    );
    const pageSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/dashboard/skills/page.tsx"),
      "utf8"
    );
    const navSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/shared/constants/dashboardNavigation.ts"),
      "utf8"
    );

    expect(constantsSource).toContain("axonrouter-stt");
    expect(constantsSource).toContain("getSkillLocalUrl");
    expect(pageSource).toContain("Read this skill and use it");
    expect(pageSource).toContain("Copy link");
    expect(pageSource).toContain("Source");
    expect(pageSource).toContain("Custom")
    expect(pageSource).toContain("Save")
    expect(pageSource).toContain("Update")
    expect(pageSource).toContain("Cancel")
    expect(pageSource).toContain("Import");
    expect(pageSource).toContain("Export");
    expect(pageSource).toContain("Search skills...");
    expect(pageSource).toContain("Use skill");
    expect(pageSource).toContain("Duplicate");
    expect(pageSource).toContain("slug")
    expect(pageSource).toContain("No built-in skills match your search.");
    expect(pageSource).toContain("Read this skill and use it:");
    expect(navSource).toContain('href: "/dashboard/skills"');
  });
});

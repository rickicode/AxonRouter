import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("page-level header search parity", () => {
  it("wires header search store into skills and media provider pages", async () => {
    const skillsSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/dashboard/skills/page.tsx"),
      "utf8"
    );
    const mediaKindSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/dashboard/media-providers/[kind]/page.tsx"),
      "utf8"
    );

    expect(skillsSource).toContain("useHeaderSearchStore");
    expect(skillsSource).toContain("Search skills...");
    expect(mediaKindSource).toContain("useHeaderSearchStore");
    expect(mediaKindSource).toContain("No media providers match current search.");
    expect(mediaKindSource).toContain("filteredProviders");
  });
});

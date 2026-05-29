import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("media provider kind disabled-model polish", () => {
  it("surfaces disabled model counts on media provider cards", async () => {
    const source = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/app/media-providers/[kind]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("disabledModelsByProvider");
    expect(source).toContain("disabledCount");
    expect(source).toContain("Visible Providers");
    expect(source).toContain("Ready");
    expect(source).toContain("Disabled");
    expect(source).toContain("/api/models/disabled");
  });
});

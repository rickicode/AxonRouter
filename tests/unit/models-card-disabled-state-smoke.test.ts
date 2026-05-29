import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("models card disabled state polish", () => {
  it("surfaces disabled model summary and helper copy", async () => {
    const source = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/app/providers/components/ModelsCard.tsx"),
      "utf8"
    );

    expect(source).toContain("disabledModels.length > 0");
    expect(source).toContain("Use eye icon to re-enable them");
    expect(source).toContain("disabled");
  });
});

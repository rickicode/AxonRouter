import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("disabled models UI wiring", () => {
  it("wires disabled model controls into ModelsCard", async () => {
    const source = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/dashboard/providers/components/ModelsCard.tsx"),
      "utf8"
    );

    expect(source).toContain("/api/models/disabled");
    expect(source).toContain("DISABLED");
    expect(source).toContain("visibility_off");
  });
});

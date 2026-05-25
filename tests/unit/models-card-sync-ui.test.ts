import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("ModelsCard sync UI wiring", () => {
  it("renders sync action and source badge hooks in source", () => {
    const file = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/app/(dashboard)/dashboard/providers/components/ModelsCard.tsx"),
      "utf8"
    );

    expect(file).toContain("Sync from /models");
    expect(file).toContain("model.source");
    expect(file).toContain("providerModels = []");
    expect(file).toContain("syncNotice");
    expect(file).toContain("syncError");
  });
});

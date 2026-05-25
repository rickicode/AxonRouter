import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("ModelSelectModal passthrough source semantics", () => {
  it("marks passthrough alias models with source alias and keeps imported/system source metadata", () => {
    const file = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/shared/components/ModelSelectModal.tsx"),
      "utf8"
    );

    expect(file).toContain('source: "alias"');
    expect(file).toContain('source: model.source || "system"');
  });
});

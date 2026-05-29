import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("OpenCodeModelSelectModal provider-models wiring", () => {
  it("fetches provider-models aggregate and passes it into grouped selectable models", () => {
    const file = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/app/(dashboard)/app/opencode/components/OpenCodeModelSelectModal.tsx"),
      "utf8"
    );

    expect(file).toContain('fetch("/api/provider-models")');
    expect(file).toContain("providerModelsByProvider");
    expect(file).toContain("buildGroupedSelectableModels({ activeProviders, modelAliases, providerNodes, providerModelsByProvider })");
  });
});

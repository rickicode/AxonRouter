import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("combos page provider-models wiring", () => {
  it("fetches aggregate provider models and passes them into grouped selectable models", () => {
    const file = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/app/(dashboard)/app/combos/page.tsx"),
      "utf8"
    );

    expect(file).toContain("useQuery");
    expect(file).toContain("queryKeys.providerModels()")
    expect(file).toContain('fetchJson<{ models?: Record<string, unknown> }>("/api/provider-models"');
    expect(file).toContain("const providerModelsByProvider = useMemo")
    expect(file).toContain('buildGroupedSelectableModels({ activeProviders, modelAliases, providerModelsByProvider })');
  });
});

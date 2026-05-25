import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("PassthroughModelsSection source/import wiring", () => {
  it("uses sync-models import path and renders source-aware passthrough rows", () => {
    const file = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/app/(dashboard)/dashboard/providers/[id]/PassthroughModelsSection.tsx"),
      "utf8"
    );

    expect(file).toContain('fetch(`/api/providers/${activeConnection.id}/sync-models?mode=import`, { method: "POST" })');
    expect(file).toContain('setSyncedModels(Array.isArray(data.models) ? data.models : [])');
    expect(file).toContain('source = "alias"');
    expect(file).toContain('Import from /models');
  });
});

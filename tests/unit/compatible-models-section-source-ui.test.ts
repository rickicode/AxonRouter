import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("CompatibleModelsSection source/import wiring", () => {
  it("uses sync-models import path and renders source badges", () => {
    const file = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/app/(dashboard)/app/providers/[id]/CompatibleModelsSection.tsx"),
      "utf8"
    );

    expect(file).toContain('fetch(`/api/providers/${activeConnection.id}/sync-models?mode=import`, { method: "POST" })');
    expect(file).toContain('queryKey: ["provider-models", activeConnection?.provider]');
    expect(file).toContain('select: (data) => Array.isArray(data.models)');
    expect(file).toContain('source: "alias"');
    expect(file).toContain('{syncNotice ? <p');
  });
});

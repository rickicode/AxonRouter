import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("BasicChatPageClient provider-models wiring", () => {
  it("fetches aggregate provider models and uses them when building provider groups", () => {
    const file = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/app/(dashboard)/app/basic-chat/BasicChatPageClient.tsx"),
      "utf8"
    );

    expect(file).toContain('fetch("/api/provider-models", { cache: "no-store" })');
    expect(file).toContain('const providerModelsByProvider = providerModelsData.models || {}');
    expect(file).toContain('const aggregateModels = Array.isArray(providerModelsByProvider?.[providerId])');
  });
});

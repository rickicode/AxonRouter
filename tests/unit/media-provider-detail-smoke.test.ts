import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("media provider detail polish", () => {
  it("renders provider notes, website, and API key link wiring", async () => {
    const source = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("Setup Snapshot");
    expect(source).toContain("Provider Alias");
    expect(source).toContain("Disabled Models");
    expect(source).toContain("disabledModelCount");
    expect(source).toContain("Provider Notes");
    expect(source).toContain("Request Tips");
    expect(source).toContain("Curated Model Fallback Active");
    expect(source).toContain("modelListingWarning");
    expect(source).toContain("KIND_TIPS");
    expect(source).toContain("Try JSON response mode when you need base64 audio");
    expect(source).toContain("Get API key");
    expect(source).toContain("provider.notice?.apiKeyUrl");
    expect(source).toContain("provider.website");
  });
});

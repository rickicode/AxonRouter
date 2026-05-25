import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("provider model catalog drift", () => {
  it("keeps refreshed Kimi labels in provider catalog", async () => {
    const source = await fs.readFile(
      path.join(import.meta.dirname, "../../open-sse/config/providerModels.ts"),
      "utf8"
    );

    expect(source).toContain('name: "Kimi K2.6"');
    expect(source).toContain('name: "Kimi K2.5"');
  });
});

import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("provider icon assets", () => {
  it("includes local assets for recently added providers", async () => {
    const mimo = await fs.readFile(path.join(process.cwd(), "..", "public/providers/mimo.svg"), "utf8");
    const commandcode = await fs.readFile(path.join(process.cwd(), "..", "public/providers/commandcode.svg"), "utf8");

    expect(mimo).toContain("FF6900");
    expect(commandcode).toContain("6366F1");
  });
});

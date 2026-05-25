import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

describe("provider icon assets", () => {
  it("includes local assets for recently added providers", async () => {
    const mimo = await fs.readFile(path.join(projectRoot, "public/providers/mimo.svg"), "utf8");
    const commandcode = await fs.readFile(path.join(projectRoot, "public/providers/commandcode.svg"), "utf8");

    expect(mimo).toContain("FF6900");
    expect(commandcode).toContain("6366F1");
  });
});

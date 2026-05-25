import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

const FILES = [
  "src/app/(dashboard)/dashboard/cli-tools/components/CodexToolCard.tsx",
  "src/app/(dashboard)/dashboard/cli-tools/components/ClaudeToolCard.tsx",
  "src/app/(dashboard)/dashboard/cli-tools/components/OpenCodeToolCard.tsx",
  "src/app/(dashboard)/dashboard/cli-tools/components/HermesToolCard.tsx",
];

describe("CLI endpoint presets wiring", () => {
  it("wires EndpointPresetControl into supported CLI tool cards", async () => {
    for (const relativePath of FILES) {
      const source = await fs.readFile(path.join(projectRoot, relativePath), "utf8");
      expect(source).toContain('import EndpointPresetControl from "./EndpointPresetControl";');
      expect(source).toContain("<EndpointPresetControl");
    }
  });
});

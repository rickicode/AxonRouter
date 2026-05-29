import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("cowork settings wiring", () => {
  it("adds route, tool card, and CLI page wiring", async () => {
    const routeSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/api/cli-tools/cowork-settings/route.ts"),
      "utf8"
    );
    const cardSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/app/cli-tools/components/CoworkToolCard.tsx"),
      "utf8"
    );
    const pageSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/(dashboard)/app/cli-tools/CLIToolsPageClient.tsx"),
      "utf8"
    );

    expect(routeSource).toContain("Claude Cowork sandbox cannot reach localhost");
    expect(cardSource).toContain("Claude Cowork");
    expect(cardSource).toContain("/api/cli-tools/cowork-settings");
    expect(pageSource).toContain('cowork: "/api/cli-tools/cowork-settings"');
    expect(pageSource).toContain("CoworkToolCard");
  });
});

import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Xiaomi MiMo parity wiring", () => {
  it("adds provider metadata, model catalog, and validation endpoint", async () => {
    const providersSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/shared/constants/providers.ts"),
      "utf8"
    );
    const modelsSource = await fs.readFile(
      path.join(import.meta.dirname, "../../open-sse/config/providerModels.ts"),
      "utf8"
    );
    const validateSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/app/api/providers/validate/route.ts"),
      "utf8"
    );

    expect(providersSource).toContain('id: "mimo"');
    expect(providersSource).toContain('name: "Xiaomi MiMo"');
    expect(modelsSource).toContain('mimo: [');
    expect(modelsSource).toContain('mimo-v2-pro');
    expect(validateSource).toContain('case "mimo"');
    expect(validateSource).toContain('https://api.mioffice.cn/v1/models');
  });
});

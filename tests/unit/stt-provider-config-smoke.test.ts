import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("STT provider config wiring", () => {
  it("declares STT route and provider configs", async () => {
    const providersSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/shared/constants/providers.ts"),
      "utf8"
    );
    const handlerSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/sse/handlers/stt.ts"),
      "utf8"
    );
    const coreSource = await fs.readFile(
      path.join(import.meta.dirname, "../../open-sse/handlers/sttCore.ts"),
      "utf8"
    );

    expect(providersSource).toContain('path: "/v1/audio/transcriptions"');
    expect(providersSource).toContain("sttConfig");
    expect(handlerSource).toContain("handleSttCore");
    expect(coreSource).toContain("transcribeDeepgram");
    expect(coreSource).toContain("transcribeOpenAICompatible");
  });
});

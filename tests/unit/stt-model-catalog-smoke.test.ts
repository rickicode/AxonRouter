import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("STT model catalog wiring", () => {
  it("includes static STT models for supported providers", async () => {
    const source = await fs.readFile(
      path.join(import.meta.dirname, "../../open-sse/config/providerModels.ts"),
      "utf8"
    );

    expect(source).toContain('whisper-1');
    expect(source).toContain('nova-3');
    expect(source).toContain('universal-3-pro');
    expect(source).toContain('nvidia/parakeet-ctc-1.1b-asr');
    expect(source).toContain('type: "stt"');
  });
});

import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Gemini TTS parity wiring", () => {
  it("adds Gemini TTS models and voices to the shared TTS config", async () => {
    const source = await fs.readFile(
      path.join(import.meta.dirname, "../../open-sse/config/ttsModels.ts"),
      "utf8"
    );

    expect(source).toContain("gemini-2.5-flash-preview-tts");
    expect(source).toContain("gemini-2.5-pro-preview-tts");
    expect(source).toContain("GEMINI_VOICES");
    expect(source).toContain("Kore");
    expect(source).toContain("Sulafat");
  });

  it("wires Gemini into TTS handler and provider UI config", async () => {
    const ttsCoreSource = await fs.readFile(
      path.join(import.meta.dirname, "../../open-sse/handlers/ttsCore.tsx"),
      "utf8"
    );
    const handlerSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/sse/handlers/tts.ts"),
      "utf8"
    );
    const providerSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/shared/constants/providers.ts"),
      "utf8"
    );
    const uiSource = await fs.readFile(
      path.join(import.meta.dirname, "../../src/shared/constants/ttsProviders.ts"),
      "utf8"
    );

    expect(ttsCoreSource).toContain("handleGeminiTts");
    expect(ttsCoreSource).toContain('responseModalities: ["AUDIO"]');
    expect(ttsCoreSource).toContain("prebuiltVoiceConfig");
    expect(ttsCoreSource).toContain("pcmToWav");
    expect(handlerSource).toContain('"gemini"');
    expect(providerSource).toContain('serviceKinds: ["llm", "embedding", "image", "imageToText", "webSearch", "stt", "tts"]');
    expect(uiSource).toContain('"gemini"');
    expect(uiSource).toContain('modelKey: "gemini-tts-models"');
  });
});

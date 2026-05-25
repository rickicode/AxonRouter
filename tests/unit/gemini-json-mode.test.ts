import { describe, expect, it } from "vitest";

import { FORMATS } from "../../open-sse/translator/formats.ts";
import { openaiToGeminiCLIRequest } from "../../open-sse/translator/request/openai-to-gemini.ts";

describe("gemini json_object mode", () => {
  it("enforces minimum maxOutputTokens and injects strict JSON instruction", () => {
    const body = {
      model: "gc/gemini-3-flash-preview",
      response_format: { type: "json_object" },
      max_tokens: 32,
      messages: [{ role: "user", content: "Return JSON" }],
    };

    const translated = openaiToGeminiCLIRequest("gemini-3-flash-preview", body, false);

    expect(translated.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(256);

    const parts = translated.systemInstruction?.parts || [];
    const allSystemText = parts.map((p: any) => p?.text || "").join("\n").toLowerCase();
    expect(allSystemText).toContain("valid json object");
    expect(allSystemText).toContain("do not use markdown fences");
  });

  it("keeps larger max_tokens when already above minimum", () => {
    const body = {
      model: "gc/gemini-3-flash-preview",
      response_format: { type: "json_object" },
      max_tokens: 768,
      messages: [{ role: "user", content: "Return JSON" }],
    };

    const translated = openaiToGeminiCLIRequest("gemini-3-flash-preview", body, false);
    expect(translated.generationConfig.maxOutputTokens).toBe(768);
  });
});

import { describe, expect, it } from "vitest";

import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { openaiToAntigravityRequest } from "../../open-sse/translator/request/openai-to-gemini.js";

function systemTextSentToAntigravity(systemContent) {
  // OpenAI-format client (e.g. a proxy converting Hermes Agent to /v1/chat/completions).
  const body = openaiToAntigravityRequest("gemini-3.8-flash-tiered", {
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: "hi" },
    ],
  }, true);
  const finalBody = new AntigravityExecutor().transformRequest("gemini-3.8-flash-tiered", body, true, {});
  return finalBody.request.systemInstruction.parts.map((p) => p.text).join("\n");
}

describe("Antigravity rewrites every Hermes identity variant", () => {
  const variants = [
    "You are Hermes Agent, an intelligent AI assistant created by Nous Research.",
    "You are Hermes Agent, built by Nous Research.",
    "You are Hermes Agent, created by Nous Research.",
    "You are Hermes Agent.",
    "You are Hermes, an AI assistant.",
    "You are Hermes Agent, an AI agent built by Nous Research.",
  ];

  for (const variant of variants) {
    it(`neutralizes: ${variant}`, () => {
      const text = systemTextSentToAntigravity(variant);
      expect(text).toContain("You are an AI assistant.");
      expect(text).not.toContain("Hermes");
      expect(text).not.toContain("Nous Research");
    });
  }

  it("leaves non-Hermes prompts untouched", () => {
    const text = systemTextSentToAntigravity("You are a helpful assistant.");
    expect(text).toContain("You are a helpful assistant.");
  });
});

import { describe, expect, it } from "vitest";

import { translateRequest } from "../../open-sse/translator/index.ts";
import { FORMATS } from "../../open-sse/translator/formats.ts";
import { applyCavemanToOpenAIIntermediate } from "../../open-sse/promptModifiers/index.ts";

const enabledFull = { enabled: true, level: "full", applyToPassthrough: true };

function cavemanModifier(body: any, context: any) {
  return applyCavemanToOpenAIIntermediate(body, enabledFull, context?.sourceFormat, context?.targetFormat);
}

describe("caveman translator integration", () => {
  it("injects before Claude target conversion so Claude receives system text", async () => {
    const result = await translateRequest(
      FORMATS.OPENAI,
      FORMATS.CLAUDE,
      "claude-3-5-sonnet",
      { messages: [{ role: "user", content: "hi" }] },
      false,
      null,
      "claude",
      null,
      [],
      null,
      cavemanModifier,
    );

    const systemText = result.system.map((part: any) => part.text || "").join("\n");
    expect(systemText).toContain("terse caveman");
    expect(result.messages.some((message: any) => message.role === "system")).toBe(false);
  });

  it("injects before Gemini target conversion so Gemini receives systemInstruction", async () => {
    const result = await translateRequest(
      FORMATS.OPENAI,
      FORMATS.GEMINI,
      "gemini-2.5-pro",
      { messages: [{ role: "user", content: "hi" }] },
      false,
      null,
      "gemini",
      null,
      [],
      null,
      cavemanModifier,
    );

    expect(result.systemInstruction.parts[0].text).toContain("terse caveman");
  });

  it("uses Responses developer input when source and target are both Responses", async () => {
    const result = await translateRequest(
      FORMATS.OPENAI_RESPONSES,
      FORMATS.OPENAI_RESPONSES,
      "gpt-5.4",
      { input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }] },
      true,
      null,
      "codex",
      null,
      [],
      null,
      cavemanModifier,
    );

    expect(result.input[0]).toMatchObject({ type: "message", role: "developer" });
    expect(result.input[0].content[0].text).toContain("terse caveman");
    expect(result.instructions).toBe("");
  });

  it("keeps Caveman in params.system on the real translated CommandCode path", async () => {
    const result = await translateRequest(
      FORMATS.OPENAI,
      FORMATS.COMMANDCODE,
      "deepseek/deepseek-v4-pro",
      { messages: [{ role: "user", content: "Explain diff" }] },
      false,
      null,
      "commandcode",
      null,
      [],
      null,
      cavemanModifier,
    );

    expect(result.params.system).toContain("terse caveman");
  });
});

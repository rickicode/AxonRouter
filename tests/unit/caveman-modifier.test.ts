import { describe, expect, it } from "vitest";
import {
  applyCavemanToOpenAIMessages,
  applyCavemanToPassthroughBody,
  CAVEMAN_MARKER,
} from "../../open-sse/promptModifiers/index.ts";
import { FORMATS } from "../../open-sse/translator/formats.ts";

const enabledFull = { enabled: true, level: "full", applyToPassthrough: true };

describe("caveman modifier", () => {
  it("prepends a system message when none exists", () => {
    const result = applyCavemanToOpenAIMessages({
      messages: [{ role: "user", content: "hi" }],
    }, enabledFull);

    expect(result.messages[0].role).toBe("system");
    expect(result.messages[0].content).toContain(CAVEMAN_MARKER);
  });

  it("appends to existing instruction message only once", () => {
    const first = applyCavemanToOpenAIMessages({
      messages: [{ role: "system", content: "existing" }, { role: "user", content: "hi" }],
    }, enabledFull);
    const second = applyCavemanToOpenAIMessages(first, enabledFull);

    expect(first.messages[0].content).toContain("existing");
    expect(first.messages[0].content).toContain(CAVEMAN_MARKER);
    expect(second.messages[0].content.match(/Caveman Mode/g)?.length).toBe(1);
  });

  it("injects passthrough responses payload via developer input item", () => {
    const result = applyCavemanToPassthroughBody({
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
    }, enabledFull, FORMATS.OPENAI_RESPONSES);

    expect(result.input[0].role).toBe("developer");
    expect(result.input[0].content[0].text).toContain(CAVEMAN_MARKER);
  });

  it("injects wrapped Gemini CLI passthrough request systemInstruction", () => {
    const result = applyCavemanToPassthroughBody({
      request: {
        systemInstruction: { parts: [{ text: "existing" }] },
        contents: [],
      },
    }, enabledFull, FORMATS.GEMINI_CLI);

    expect(result.request.systemInstruction.parts.map((part: any) => part.text).join("\n")).toContain(CAVEMAN_MARKER);
  });

  it("respects applyToPassthrough=false", () => {
    const body = { system: "existing" };
    const result = applyCavemanToPassthroughBody(body, {
      enabled: true,
      level: "lite",
      applyToPassthrough: false,
    }, FORMATS.CLAUDE);

    expect(result).toEqual(body);
  });
});

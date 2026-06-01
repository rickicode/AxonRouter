import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const streamPath = path.resolve(import.meta.dirname, "../../open-sse/utils/stream.tsx");

describe("openai stream think guard", () => {
  it("sanitizes passthrough OpenAI stream chunks that carry <think> in delta.content", async () => {
    const source = await fs.readFile(streamPath, "utf8");

    expect(source).toContain("function createThinkStreamState()");
    expect(source).toContain("function consumeVisibleOpenAIStreamText(text, state)");
    expect(source).toContain('indexOf("<think>")');
    expect(source).toContain('indexOf("</think>")');
    expect(source).toContain("delta.reasoning_content = reasoning");
  });

  it("synthesizes a final finish_reason chunk for passthrough streams that end without one", async () => {
    const source = await fs.readFile(streamPath, "utf8");

    expect(source).toContain("passthroughFinishReasonSeen");
    expect(source).toContain("buildSyntheticOpenAIFinishChunk");
    expect(source).toContain("shouldSynthesizeOpenAIFinishChunk");
    expect(source).toContain("sourceFormat === FORMATS.OPENAI");
    expect(source).toContain('finish_reason: "stop"');
    expect(source).toContain('trimmed.slice(5).trim() === "[DONE]"');
  });
});

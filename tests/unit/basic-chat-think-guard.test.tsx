import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const pagePath = path.resolve(
  import.meta.dirname,
  "../../src/app/(dashboard)/app/basic-chat/BasicChatPageClient.tsx"
);

describe("basic chat think guard", () => {
  it("strips visible <think> tags from assistant text before rendering", async () => {
    const source = await fs.readFile(pagePath, "utf8");

    expect(source).toContain("function stripVisibleThinkTags(text)");
    expect(source).toContain("function consumeAssistantVisibleText(text, state)");
    expect(source).toContain('state.inThink');
    expect(source).toContain('indexOf("<think>")');
    expect(source).toContain('indexOf("</think>")');
    expect(source).toContain("readAssistantText(chunk, thinkState)");
  });
});

import { describe, expect, it } from "vitest";

import { AGENT_TOOL_AWARENESS_GUIDANCE } from "../../open-sse/config/agentToolAwareness.ts";
import { MORPH_DEFAULT_INSTRUCTIONS } from "../../open-sse/config/morphInstructions.ts";
import { COMMANDCODE_DEFAULT_INSTRUCTIONS } from "../../open-sse/config/commandcodeInstructions.ts";
import { CODEX_DEFAULT_INSTRUCTIONS } from "../../open-sse/config/codexInstructions.ts";

describe("shared agent tool awareness guidance", () => {
  it("defines shared guidance for tool-aware coding agents", () => {
    expect(AGENT_TOOL_AWARENESS_GUIDANCE).toContain("## Tool awareness");
    expect(AGENT_TOOL_AWARENESS_GUIDANCE).toContain("Use the available agent tools instead of guessing");
    expect(AGENT_TOOL_AWARENESS_GUIDANCE).toContain("pass the current working directory or active workspace path");
    expect(AGENT_TOOL_AWARENESS_GUIDANCE).toContain("Do not invent absolute paths from other repositories or prior sessions");
    expect(AGENT_TOOL_AWARENESS_GUIDANCE).toContain("Do not present internal tool-call markup");
  });

  it("is included in Morph, CommandCode, and Codex instructions", () => {
    expect(MORPH_DEFAULT_INSTRUCTIONS).toContain("## Tool awareness");
    expect(COMMANDCODE_DEFAULT_INSTRUCTIONS).toContain("## Tool awareness");
    expect(CODEX_DEFAULT_INSTRUCTIONS).toContain("## Tool awareness");
  });
});

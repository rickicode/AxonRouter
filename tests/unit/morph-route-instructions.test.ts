import { beforeEach, describe, expect, it, vi } from "vitest";

import { MORPH_DEFAULT_INSTRUCTIONS } from "../../open-sse/config/morphInstructions.ts";

const resolveMorphInstructionsForRequest = vi.fn();
const buildMorphRepoContext = vi.fn();
const existsSync = vi.fn();

vi.mock("../../open-sse/config/morphInstructionsResolver.ts", () => ({
  resolveMorphInstructionsForRequest,
}));

vi.mock("../../src/lib/morph/repoContext.ts", () => ({
  buildMorphRepoContext,
}));

vi.mock("node:fs", () => ({
  existsSync,
}));

vi.mock("@/lib/dataDir", () => ({
  dataFileExists: (...args: any[]) => existsSync(...args),
}));

describe("Morph instruction injection helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resolveMorphInstructionsForRequest.mockResolvedValue(MORPH_DEFAULT_INSTRUCTIONS);
    existsSync.mockReturnValue(false);
    buildMorphRepoContext.mockReturnValue({
      workingDir: "/workspaces/axonrouter",
      date: "2026-05-07",
      environment: "linux-x64, Node.js v24.0.0",
      structure: [],
      isGitRepo: true,
      currentBranch: "main",
      mainBranch: "main",
      gitStatus: "M 0, D 0, ?? 0",
      recentCommits: [],
    });
  });

  it("injects instructions, intent guidance, and repo context when no system or developer message exists", async () => {
    const { resolveAndInjectMorphInstructions } = await import("../../src/lib/morph/instructions.ts");

    const payload = await resolveAndInjectMorphInstructions({
      model: "morph-qwen35-397b",
      messages: [{ role: "user", content: "review this file" }],
    });

    expect(payload.messages[0]).toEqual({
      role: "system",
      content: expect.stringContaining("You are Morph Fast Models operating as a coding agent on the user's computer."),
    });
    expect(payload.messages[0].content).toContain("Intent mode: analysis-first");
    expect(payload.messages[0].content).toContain("pass the active workspace path instead of omitting it");
    expect(payload.messages[0].content).toContain("do not invent absolute paths from other repositories or prior sessions");
    expect(payload.morphContext.repo.workingDir).toBe("/workspaces/axonrouter");
    expect(payload.messages[1]).toEqual({ role: "user", content: "review this file" });
  });

  it("appends Morph workflow guidance even when explicit system guidance already exists", async () => {
    const { resolveAndInjectMorphInstructions } = await import("../../src/lib/morph/instructions.ts");

    const original = {
      model: "morph-qwen35-397b",
      messages: [
        { role: "system", content: "Use my custom rules" },
        { role: "user", content: "review this file" },
      ],
    };

    const payload = await resolveAndInjectMorphInstructions(original);

    expect(payload.messages[0].role).toBe("system");
    expect(payload.messages[0].content).toContain("Use my custom rules");
    expect(payload.messages[0].content).toContain("You are Morph Fast Models operating as a coding agent on the user's computer.");
    expect(payload.messages[0].content).toContain("Intent mode: analysis-first");
    expect(payload.messages[0].content).toContain("use the active workspace path from the repository context by default unless a different scope is explicitly confirmed");
    expect(payload.morphContext.repo.workingDir).toBe("/workspaces/axonrouter");
  });

  it("marks explicit implementation requests as edit-allowed", async () => {
    const { resolveAndInjectMorphInstructions } = await import("../../src/lib/morph/instructions.ts");

    const payload = await resolveAndInjectMorphInstructions({
      model: "morph-qwen35-397b",
      messages: [{ role: "user", content: "please refactor this handler and edit the file now" }],
    });

    expect(payload.messages[0].content).toContain("Intent mode: edit-allowed");
  });

  it("injects explicit workflow planning guidance when planning signals are present", async () => {
    const { resolveAndInjectMorphInstructions } = await import("../../src/lib/morph/instructions.ts");

    const payload = await resolveAndInjectMorphInstructions({
      model: "morph-qwen35-397b",
      messages: [
        { role: "developer", content: "Plannotator planning mode active. Do not implement yet." },
        { role: "user", content: "review this design and prepare the plan" },
      ],
    });

    expect(payload.messages[0].role).toBe("system");
    expect(payload.messages[0].content).toContain("Plannotator planning mode active. Do not implement yet.");
    expect(payload.messages[0].content).toContain("Workflow mode: planning.");
    expect(payload.messages[0].content).toContain("do not implement or mutate files unless the user explicitly asks to execute the plan now");
  });

  it("switches large file write tool calls into clean apply mode", async () => {
    const { resolveAndInjectMorphInstructions } = await import("../../src/lib/morph/instructions.ts");

    const payload = await resolveAndInjectMorphInstructions({
      model: "morph-qwen35-397b",
      messages: [
        { role: "user", content: "old irrelevant context" },
        { role: "assistant", content: "old irrelevant analysis" },
        { role: "user", content: "update the generated file only where needed" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_write_1",
            type: "function",
            function: {
              name: "write",
              arguments: JSON.stringify({ path: "src/big.ts", content: "x".repeat(90000) }),
            },
          }],
        },
      ],
    });

    expect(payload.morphContext.cleanApplyMode).toBe(true);
    expect(payload.messages[0].content).toContain("Execution mode: clean-apply.");
    expect(payload.messages[0].content).toContain("Focus only on the current file operation");
    expect(payload.messages[0].content).toContain("If this file already exists, prefer an edit/apply-style mutation over rewriting the entire file from scratch.");
    expect(payload.messages[0].content).toContain("Target file: src/big.ts.");
    expect(payload.messages[0].content).toContain("User request summary:");
    expect(payload.messages.some((message) => message?.content === "old irrelevant analysis")).toBe(true);
    expect(payload.messages.some((message) => message?.content === "old irrelevant context")).toBe(true);
    expect(payload.messages.some((message) => message?.content === "update the generated file only where needed")).toBe(true);
  });

  it("marks existing large write targets as existing-file mutations", async () => {
    existsSync.mockReturnValueOnce(true);
    const { resolveAndInjectMorphInstructions } = await import("../../src/lib/morph/instructions.ts");

    const payload = await resolveAndInjectMorphInstructions({
      model: "morph-qwen35-397b",
      messages: [
        { role: "user", content: "rewrite only the necessary parts" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_write_existing",
            type: "function",
            function: {
              name: "write",
              arguments: JSON.stringify({ path: "src/existing.ts", content: "x".repeat(90000) }),
            },
          }],
        },
      ],
    });

    expect(payload.messages[0].content).toContain("This target already exists in the workspace, so treat it as an existing-file mutation and prefer edit/apply-style changes.");
  });

  it("requires internal fast apply for edit tool calls", async () => {
    existsSync.mockReturnValueOnce(true);
    const { resolveAndInjectMorphInstructions } = await import("../../src/lib/morph/instructions.ts");

    const payload = await resolveAndInjectMorphInstructions({
      model: "morph-qwen35-397b",
      messages: [
        { role: "user", content: "edit this file surgically" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_edit_existing",
            type: "function",
            function: {
              name: "edit",
              arguments: JSON.stringify({ path: "src/existing.ts", oldText: "a", newText: "b" }),
            },
          }],
        },
      ],
    });

    expect(payload.morphContext.cleanApplyMode).toBe(true);
    expect(payload.messages[0].content).toContain("Internal fast-apply mode is mandatory for this edit operation. Do not use raw rewrite semantics.");
  });

  it("trims clean apply history to the most relevant recent messages", async () => {
    const { resolveAndInjectMorphInstructions } = await import("../../src/lib/morph/instructions.ts");

    const payload = await resolveAndInjectMorphInstructions({
      model: "morph-qwen35-397b",
      stream: true,
      temperature: 0.2,
      messages: [
        { role: "user", content: "context 1" },
        { role: "assistant", content: "analysis 1" },
        { role: "user", content: "context 2" },
        { role: "assistant", content: "analysis 2" },
        { role: "user", content: "do the final large rewrite" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_write_2",
            type: "function",
            function: {
              name: "write",
              arguments: JSON.stringify({ path: "src/big.ts", content: "x".repeat(90000) }),
            },
          }],
        },
      ],
    });

    expect(payload.stream).toBe(true);
    expect(payload.temperature).toBe(0.2);
    expect(payload.morphContext.executionPayloadMode).toBe("fresh");
    expect(payload.morphContext.estimatedTokenCount).toBeGreaterThan(0);
    const nonSystemMessages = payload.messages.slice(1);
    expect(nonSystemMessages).toEqual([
      { role: "user", content: "context 2" },
      { role: "user", content: "do the final large rewrite" },
      { role: "assistant", content: "analysis 2" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{
          id: "call_write_2",
          type: "function",
          function: {
            name: "write",
            arguments: JSON.stringify({ path: "src/big.ts", content: "x".repeat(90000) }),
          },
        }],
      },
    ]);
  });
});

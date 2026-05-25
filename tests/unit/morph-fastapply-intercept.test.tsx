import { beforeEach, describe, expect, it, vi } from "vitest";

const readFile = vi.fn();

vi.mock("node:fs/promises", () => ({
  default: {
    readFile,
  },
  readFile,
}));

describe("Morph fast apply interception detection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("detects a single exact edit on an existing file", async () => {
    readFile.mockResolvedValueOnce("const value = 1;\nconsole.log(value);\n");
    const { detectMorphFastApplyInterception } = await import("../../src/lib/morph/fastApplyIntercept.tsx");

    const result = await detectMorphFastApplyInterception({
      messages: [
        { role: "user", content: "change the value to 2" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_edit_1",
            type: "function",
            function: {
              name: "edit",
              arguments: JSON.stringify({ path: "src/example.js", oldText: "const value = 1;", newText: "const value = 2;" }),
            },
          }],
        },
      ],
    });

    expect(result).toMatchObject({
      intercept: true,
      reason: "single_exact_edit",
      targetPath: "src/example.js",
      instruction: expect.stringContaining("Apply this exact edit surgically in src/example.js."),
      updatedCode: "const value = 2;\nconsole.log(value);\n",
      update: "// ... existing code ...\nconst value = 2;\n// ... existing code ...",
    });
  });

  it("falls back when oldText is ambiguous", async () => {
    readFile.mockResolvedValueOnce("const value = 1;\nconst value = 1;\n");
    const { detectMorphFastApplyInterception } = await import("../../src/lib/morph/fastApplyIntercept.tsx");

    const result = await detectMorphFastApplyInterception({
      messages: [{
        role: "assistant",
        content: "",
        tool_calls: [{
          id: "call_edit_2",
          type: "function",
          function: {
            name: "functions.edit",
            arguments: JSON.stringify({ path: "src/example.js", oldText: "const value = 1;", newText: "const value = 2;" }),
          },
        }],
      }],
    });

    expect(result).toEqual({ intercept: false, reason: "old_text_ambiguous" });
  });

  it("builds a Morph Apply request payload for eligible edits", async () => {
    readFile.mockResolvedValueOnce("const value = 1;\nconsole.log(value);\n");
    const { maybeBuildMorphFastApplyPayload } = await import("../../src/lib/morph/fastApplyIntercept.tsx");

    const result = await maybeBuildMorphFastApplyPayload({
      model: "morph-qwen35-397b",
      morphContext: { cleanApplyMode: true },
      messages: [
        { role: "user", content: "change the value to 2" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_edit_3",
            type: "function",
            function: {
              name: "edit",
              arguments: JSON.stringify({ path: "src/example.js", oldText: "const value = 1;", newText: "const value = 2;" }),
            },
          }],
        },
      ],
    });

    expect(result.intercept).toBe(true);
    expect(result.requestPayload).toMatchObject({
      model: "morph-v3-fast",
      stream: false,
      morphContext: expect.objectContaining({
        internalFastApplyIntercepted: true,
        internalFastApplyTargetPath: "src/example.js",
        internalFastApplyModel: "morph-v3-fast",
      }),
    });
    expect(result.requestPayload.messages[0].content).toContain("<instruction>");
    expect(result.requestPayload.messages[0].content).toContain("<code>");
    expect(result.requestPayload.messages[0].content).toContain("<update>");
  });

  it("uses the configured fast apply model override when provided", async () => {
    readFile.mockResolvedValueOnce("const value = 1;\nconsole.log(value);\n");
    const { maybeBuildMorphFastApplyPayload } = await import("../../src/lib/morph/fastApplyIntercept.tsx");

    const result = await maybeBuildMorphFastApplyPayload({
      model: "morph-qwen35-397b",
      morphContext: { cleanApplyMode: true },
      messages: [
        { role: "user", content: "change the value to 2" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_edit_override",
            type: "function",
            function: {
              name: "edit",
              arguments: JSON.stringify({ path: "src/example.js", oldText: "const value = 1;", newText: "const value = 2;" }),
            },
          }],
        },
      ],
    }, {
      fastApplyModel: "morph-v3-large",
    });

    expect(result.intercept).toBe(true);
    expect(result.requestPayload.model).toBe("morph-v3-large");
    expect(result.requestPayload.morphContext.internalFastApplyModel).toBe("morph-v3-large");
  });

  it("intercepts large existing-file writes using marker-wrapped line-aware replacement", async () => {
    readFile.mockResolvedValueOnce([
      "export function makeSummary(input) {",
      "  const lines = [];",
      "  lines.push(`count:${input.items.length}`);",
      "  lines.push(`first:${input.items[0] || \"none\"}`);",
      "  lines.push(`mode:${input.mode || \"default\"}`);",
      "  return lines.join(\"|\");",
      "}",
      "",
      "export function formatMeta(meta) {",
      "  return `${meta.id}:${meta.label}`;",
      "}",
      "",
    ].join("\n"));
    const { maybeBuildMorphFastApplyPayload } = await import("../../src/lib/morph/fastApplyIntercept.tsx");

    const result = await maybeBuildMorphFastApplyPayload({
      model: "morph-qwen35-397b",
      morphContext: { cleanApplyMode: true },
      messages: [
        { role: "user", content: "rewrite the summary implementation but keep formatMeta" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_write_4",
            type: "function",
            function: {
              name: "write",
              arguments: JSON.stringify({
                path: "src/example.js",
                content: [
                  "export function makeSummary(input) {",
                  "  return JSON.stringify({ count: input.items.length, first: input.items[0] || \"none\", mode: input.mode || \"default\" });",
                  "}",
                  "",
                  "export function formatMeta(meta) {",
                  "  return `${meta.id}:${meta.label}`;",
                  "}",
                  "",
                ].join("\n"),
              }),
            },
          }],
        },
      ],
    });

    expect(result.intercept).toBe(true);
    expect(result.requestPayload.model).toBe("morph-v3-fast");
    expect(result.plan.update).toBe([
      "export function makeSummary(input) {",
      "// ... existing code ...",
      "  return JSON.stringify({ count: input.items.length, first: input.items[0] || \"none\", mode: input.mode || \"default\" });",
      "// ... existing code ...",
      "}",
      "",
      "export function formatMeta(meta) {",
      "  return `${meta.id}:${meta.label}`;",
      "}",
      "",
    ].join("\n"));
  });
});

import { describe, expect, it } from "vitest";
import { MORPH_DEFAULT_INSTRUCTIONS } from "../../open-sse/config/morphInstructions.ts";

describe("Morph default instructions planning behavior", () => {
  it("tells Morph Fast Models to plan or review first before editing for analysis-style requests", () => {
    expect(MORPH_DEFAULT_INSTRUCTIONS).toContain("Editing constraints");
    expect(MORPH_DEFAULT_INSTRUCTIONS).toContain("Planning and Review First");
    expect(MORPH_DEFAULT_INSTRUCTIONS).toContain("do not jump straight into editing files");
    expect(MORPH_DEFAULT_INSTRUCTIONS).toContain("respond with a plan, findings, risks, likely causes, or recommended steps before making changes");
    expect(MORPH_DEFAULT_INSTRUCTIONS).toContain("If the request is ambiguous between planning and editing, prefer planning first");
    expect(MORPH_DEFAULT_INSTRUCTIONS).toContain("If the user asks for a review, prioritize bugs, risks, regressions, and missing tests over summaries");
  });
});

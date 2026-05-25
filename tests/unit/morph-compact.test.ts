import { beforeEach, describe, expect, it, vi } from "vitest";

const executeWithMorphKeyFailover = vi.fn();

vi.mock("../../src/lib/morph/keySelection.ts", () => ({
  executeWithMorphKeyFailover,
}));

describe("Morph clean apply compact", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("skips compaction when clean apply mode is off", async () => {
    const { maybeCompactCleanApplyPayload } = await import("../../src/lib/morph/compact.ts");
    const payload = { messages: [{ role: "user", content: "hi" }], morphContext: { cleanApplyMode: false } };

    await expect(maybeCompactCleanApplyPayload(payload, { baseUrl: "https://api.morphllm.com", apiKeys: [] })).resolves.toBe(payload);
    expect(executeWithMorphKeyFailover).not.toHaveBeenCalled();
  });

  it("compacts only the older prefix and keeps recent messages verbatim", async () => {
    const { maybeCompactCleanApplyPayload } = await import("../../src/lib/morph/compact.ts");

    executeWithMorphKeyFailover.mockImplementationOnce(async ({ execute }) => execute({ apiKey: "mk-1", email: "a@example.com", attempt: 0, totalKeys: 1 }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      messages: [
        { role: "system", content: "compacted system" },
        { role: "user", content: "compacted user" },
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const payload = {
      messages: [
        { role: "system", content: "system guidance" },
        { role: "user", content: "older context" },
        { role: "assistant", content: "older analysis" },
        { role: "user", content: "keep recent user" },
        { role: "assistant", content: "keep recent assistant" },
      ],
      morphContext: { cleanApplyMode: true },
    };

    const result = await maybeCompactCleanApplyPayload(payload, {
      baseUrl: "https://api.morphllm.com",
      apiKeys: [{ key: "mk-1", status: "active", isExhausted: false }],
      roundRobinEnabled: false,
    });

    expect(result.morphContext.compactedForCleanApply).toBe(true);
    expect(result.morphContext.compactSavedMessages).toBe(1);
    expect(result.morphContext.compactOriginalPrefixMessages).toBe(3);
    expect(result.morphContext.compactedPrefixMessages).toBe(2);
    expect(result.morphContext.compactQuery).toBe("keep recent user");
    expect(result.messages).toEqual([
      { role: "system", content: "compacted system" },
      { role: "user", content: "compacted user" },
      { role: "user", content: "keep recent user" },
      { role: "assistant", content: "keep recent assistant" },
    ]);
  });
});

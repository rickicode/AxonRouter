import { describe, expect, it } from "vitest";

const { classifyBlockedCredentials } = await import("../../src/sse/services/auth.js");

describe("API-key provider exhaustion classification", () => {
  it("returns account exhausted when all credentials have account quota exhaustion", async () => {
    const result = classifyBlockedCredentials("opencode-zen", "muse-spark-1.2-contributor-free", [
      { id: "a", isActive: true, testStatus: "exhausted" },
      { id: "b", isActive: true, testStatus: "exhausted" },
    ]);
    expect(result).toMatchObject({ allRateLimited: true, lastErrorCode: "ACCOUNT_EXHAUSTED" });
    expect(result.statusBreakdown.accountExhausted).toBe(2);
  });

  it("never reports a model lock as active after its timestamp expires", async () => {
    const result = classifyBlockedCredentials("opencode-zen", "muse-spark-1.2-contributor-free", [
      { id: "a", isActive: true, testStatus: "active", modelLocks: { "muse-spark-1.2-contributor-free": new Date(Date.now() - 1000).toISOString() } },
    ]);
    expect(result).toBeNull();
  });

  it("reports mixed blocked states instead of claiming all accounts are exhausted", () => {
    const result = classifyBlockedCredentials("unikey", "gemini-3.5-flash", [
      { id: "a", isActive: true, testStatus: "exhausted" },
      { id: "b", isActive: false, testStatus: "disabled" },
    ]);
    expect(result).toMatchObject({ allRateLimited: true, lastErrorCode: "MIXED_BLOCKED" });
    expect(result.statusBreakdown).toMatchObject({ accountExhausted: 1, disabled: 1 });
  });

  it("treats all active model-locked with disabled remainder as MODEL_EXHAUSTED with cooldown", () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    const result = classifyBlockedCredentials("opencode-zen", "muse-spark-1.3-contributor-free", [
      { id: "a", isActive: true, testStatus: "active", modelLocks: { "muse-spark-1.3-contributor-free": future } },
      { id: "b", isActive: true, testStatus: "active", modelLocks: { "muse-spark-1.3-contributor-free": future } },
      { id: "c", isActive: false, testStatus: "disabled" },
      { id: "d", isActive: false, testStatus: "disabled" },
    ]);
    expect(result).toMatchObject({ allRateLimited: true, lastErrorCode: "MODEL_EXHAUSTED" });
    expect(result.retryAfterHuman).toMatch(/reset after/);
    expect(result.statusBreakdown).toMatchObject({ modelExhausted: 2, disabled: 2 });
  });
});

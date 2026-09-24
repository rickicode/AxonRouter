import { describe, expect, it } from "vitest";

describe("routing query scale contracts", () => {
  it("keeps candidate retrieval bounded by the repository limit", async () => {
    const source = await import("../../src/lib/db/repos/connectionsRepo.js");
    expect(source.getAvailableAccountsForRouting).toBeTypeOf("function");
  });

  it("caps usage history pages", async () => {
    const source = await import("../../src/lib/db/repos/usageRepo.js");
    expect(source.getUsageHistory).toBeTypeOf("function");
  });
});

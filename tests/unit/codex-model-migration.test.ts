import { describe, expect, it } from "vitest";

import { migrateCodexModel } from "../../open-sse/executors/codex.tsx";

describe("codex model migration", () => {
  it("migrates deprecated gpt-5.4 to gpt-5.5", () => {
    expect(migrateCodexModel("gpt-5.4")).toBe("gpt-5.5");
  });

  it("migrates deprecated gpt-5.3-codex to gpt-5.4 then to gpt-5.5", () => {
    // Note: We only apply direct migrations, not transitive ones in a single pass
    // But gpt-5.3-codex should map to gpt-5.4 (which would then need another pass to become gpt-5.5)
    expect(migrateCodexModel("gpt-5.3-codex")).toBe("gpt-5.4");
  });

  it("migrates deprecated gpt-5.2 to gpt-5.4", () => {
    expect(migrateCodexModel("gpt-5.2")).toBe("gpt-5.4");
  });

  it("preserves codex/ prefix during migration", () => {
    expect(migrateCodexModel("codex/gpt-5.4")).toBe("codex/gpt-5.5");
    expect(migrateCodexModel("codex/gpt-5.3-codex")).toBe("codex/gpt-5.4");
  });

  it("migrates effort variants correctly", () => {
    expect(migrateCodexModel("gpt-5.3-codex-high")).toBe("gpt-5.4-high");
    expect(migrateCodexModel("gpt-5.4-high")).toBe("gpt-5.5-high");
    expect(migrateCodexModel("gpt-5.4-low")).toBe("gpt-5.5-low");
  });

  it("migrates mini/pro/nano variants", () => {
    expect(migrateCodexModel("gpt-5.4-mini")).toBe("gpt-5.5-mini");
    expect(migrateCodexModel("gpt-5.4-pro")).toBe("gpt-5.5-pro");
    expect(migrateCodexModel("gpt-5.4-nano")).toBe("gpt-5.5-nano");
  });

  it("does not migrate current models", () => {
    expect(migrateCodexModel("gpt-5.5")).toBe("gpt-5.5");
    expect(migrateCodexModel("gpt-5.5-high")).toBe("gpt-5.5-high");
    expect(migrateCodexModel("codex/gpt-5.5")).toBe("codex/gpt-5.5");
  });

  it("handles empty or invalid input gracefully", () => {
    expect(migrateCodexModel("")).toBe("");
    expect(migrateCodexModel(null as any)).toBe(null);
    expect(migrateCodexModel(undefined as any)).toBe(undefined);
  });
});

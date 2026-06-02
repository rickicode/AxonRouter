import { describe, expect, it } from "vitest";
import { normalizeComboDraft, validateComboGraph, findComboDependents, cascadeComboRename, cascadeComboDelete } from "../../src/lib/combos/domain.ts";

describe("combo domain boundary", () => {
  it("normalizes mixed models into stable combo steps", () => {
    const raw = ["openai/gpt-4", { kind: "combo-ref", comboName: "my-combo" }, { model: "claude" }];
    const normalized = normalizeComboDraft(raw, "test", []);
    
    expect(normalized).toHaveLength(3);
    expect(normalized[0].kind).toBe("model");
    expect(normalized[0].model).toBe("openai/gpt-4");
    
    expect(normalized[1].kind).toBe("combo-ref");
    expect(normalized[1].comboName).toBe("my-combo");
    
    expect(normalized[2].kind).toBe("model");
    expect(normalized[2].model).toBe("claude");
  });

  it("finds combo dependents accurately", () => {
    const combos = [
      { id: "1", name: "A", models: [{ kind: "combo-ref", comboName: "B" }] },
      { id: "2", name: "B", models: [{ kind: "model", model: "gpt" }] },
      { id: "3", name: "C", models: [{ kind: "combo-ref", comboName: "B" }] }
    ] as any[];
    
    const deps = findComboDependents("B", combos);
    expect(deps).toHaveLength(2);
    expect(deps.map(d => d.name)).toEqual(["A", "C"]);
    
    const selfDeps = findComboDependents("B", combos, "1");
    expect(selfDeps).toHaveLength(1);
    expect(selfDeps[0].name).toBe("C");
  });

  it("cascades rename correctly", () => {
    const combos = [
      { id: "1", name: "A", models: [{ kind: "combo-ref", comboName: "B" }] },
      { id: "2", name: "B", models: [{ kind: "model", model: "gpt" }] }
    ] as any[];
    
    const cascaded = cascadeComboRename(combos, "B", "New-B", "2");
    expect((cascaded[0].models[0] as any).comboName).toBe("New-B");
    expect(cascaded[1].name).toBe("B"); // target combo itself is updated separately in actual flow
  });

  it("cascades delete correctly", () => {
    const combos = [
      { id: "1", name: "A", models: [{ kind: "combo-ref", comboName: "B" }, { kind: "model", model: "gpt" }] },
      { id: "2", name: "B", models: [{ kind: "model", model: "claude" }] }
    ] as any[];
    
    const cascaded = cascadeComboDelete(combos, "B");
    expect(cascaded[0].models).toHaveLength(1);
    expect(cascaded[0].models[0].kind).toBe("model");
  });
});

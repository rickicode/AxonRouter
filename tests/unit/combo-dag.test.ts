import { describe, expect, it } from "vitest";
import { validateComboDAG } from "../../src/lib/combos/dag.ts";

describe("combo DAG validation", () => {
  it("accepts nested combos without cycles", () => {
    expect(() =>
      validateComboDAG("alpha", [
        { name: "alpha", models: [{ kind: "combo-ref", comboName: "beta" }] },
        { name: "beta", models: [{ kind: "model", model: "openai/gpt-4.1" }] },
      ])
    ).not.toThrow();
  });

  it("rejects circular combo references", () => {
    expect(() =>
      validateComboDAG("alpha", [
        { name: "alpha", models: [{ kind: "combo-ref", comboName: "beta" }] },
        { name: "beta", models: [{ kind: "combo-ref", comboName: "alpha" }] },
      ])
    ).toThrow(/Circular combo reference/);
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const combosPagePath = path.resolve(import.meta.dirname, "../../src/app/(dashboard)/dashboard/combos/page.tsx");
const intelligentPanelPath = path.resolve(import.meta.dirname, "../../src/app/(dashboard)/dashboard/combos/IntelligentComboPanel.tsx");
const intelligentBuilderPath = path.resolve(import.meta.dirname, "../../src/app/(dashboard)/dashboard/combos/BuilderIntelligentStep.tsx");

describe("combo builder UI parity smoke", () => {
  it("uses staged builder flow with intelligent/review stages", () => {
    const source = fs.readFileSync(combosPagePath, "utf8");
    expect(source).toContain('const BUILDER_STAGES = ["basics", "steps", "strategy", "intelligent", "review"]');
    expect(source).toContain('BuilderBasicsStage');
    expect(source).toContain('BuilderIntelligentStep');
    expect(source).toContain('IntelligentComboPanel');
  });

  it("renders mapping editor workflow instead of prompt-only flow", () => {
    const source = fs.readFileSync(combosPagePath, "utf8");
    expect(source).toContain('showMappingEditor');
    expect(source).toContain('handleSaveMapping');
    expect(source).toContain('handleCreateMapping');
  });

  it("ships intelligent builder and dashboard modules", () => {
    const builderSource = fs.readFileSync(intelligentBuilderPath, "utf8");
    const panelSource = fs.readFileSync(intelligentPanelPath, "utf8");
    expect(builderSource).toContain('Intelligent Routing Configuration');
    expect(builderSource).toContain('Candidate Pool');
    expect(panelSource).toContain('Intelligent Routing Dashboard');
    expect(panelSource).toContain('Provider Scores');
  });
});

import { normalizeComboModels, getComboModelProvider, getComboStepTarget, isComboRefStep, isComboModelStep, getComboModelString, getComboStepWeight } from "./steps";
import { validateComboDAG } from "./dag";

export interface ComboStep {
  id: string;
  kind: "model" | "combo-ref";
  model?: string;
  providerId?: string;
  comboName?: string;
  connectionId?: string;
  weight?: number;
  label?: string;
  tags?: string[];
}

export interface Combo {
  id: string;
  name: string;
  models: ComboStep[];
  strategy?: string;
  config?: Record<string, unknown>;
  priority?: number;
  sortOrder?: number;
  [key: string]: unknown;
}

export type ComboMap = Map<string, Combo>;
export type ComboArray = Combo[];

/**
 * Normalizes input models (strings or partial objects) into canonical ComboSteps.
 */
export function normalizeComboDraft(
  modelsInput: unknown,
  comboName: string,
  allCombos: ComboArray | ComboMap
): ComboStep[] {
  const combos = allCombos instanceof Map ? Array.from(allCombos.values()) : allCombos;
  return normalizeComboModels(modelsInput, { comboName, allCombos: combos }) as ComboStep[];
}

/**
 * Validates DAG for a specific combo.
 * Checks for missing refs, circular dependencies, and max depth.
 */
export function validateComboGraph(
  comboName: string,
  combos: ComboArray,
  options?: { maxDepth?: number }
): boolean {
  return validateComboDAG(comboName, combos, options);
}

/**
 * Finds all combos that reference a given combo name.
 */
export function findComboDependents(targetName: string, combos: ComboArray, targetId?: string): Combo[] {
  return combos.filter((combo) => {
    if (targetId && combo.id === targetId) return false;
    const models = Array.isArray(combo.models) ? combo.models : [];
    return models.some((step) => {
      if (!step || typeof step !== "object") return false;
      const comboRef = step as Record<string, unknown>;
      return comboRef.kind === "combo-ref" && typeof comboRef.comboName === "string" && comboRef.comboName.trim() === targetName;
    });
  });
}

/**
 * Updates combo references safely across the entire collection.
 */
export function cascadeComboRename(
  combos: ComboArray,
  oldName: string,
  newName: string,
  targetId: string
): ComboArray {
  const now = new Date().toISOString();
  return combos.map((combo) => {
    if (combo.id === targetId) return combo;
    if (!Array.isArray(combo.models)) return combo;
    
    let changed = false;
    const updatedModels = combo.models.map((step) => {
      if (!step || typeof step !== "object") return step;
      if (step.kind === "combo-ref" && typeof (step as any).comboName === "string" && (step as any).comboName.trim() === oldName) {
        changed = true;
        return { ...step, comboName: newName };
      }
      return step;
    });
    
    if (changed) {
      return { ...combo, models: updatedModels, updatedAt: now };
    }
    return combo;
  });
}

/**
 * Removes references to a deleted combo from all other combos.
 */
export function cascadeComboDelete(combos: ComboArray, deletedName: string): ComboArray {
  if (!deletedName) return combos;
  
  return combos.map((combo) => {
    if (!Array.isArray(combo.models)) return combo;
    
    const filtered = combo.models.filter((step) => {
      if (!step || typeof step !== "object") return true;
      if (step.kind === "combo-ref" && typeof (step as any).comboName === "string" && (step as any).comboName.trim() === deletedName) {
        return false;
      }
      return true;
    });
    
    if (filtered.length !== combo.models.length) {
      return { ...combo, models: filtered, updatedAt: new Date().toISOString() };
    }
    return combo;
  });
}

export {
  normalizeComboModels,
  getComboModelProvider,
  getComboStepTarget,
  isComboRefStep,
  isComboModelStep,
  getComboModelString,
  getComboStepWeight,
  validateComboDAG
};

import { CORE_MODEL_COMBOS, GENERAL_LATEST_COMBOS } from "open-sse/config/coreModelCombos.js";

export const BUILTIN_COMBO_NAMES = new Set([
  ...Object.keys(CORE_MODEL_COMBOS || {}),
  ...Object.keys(GENERAL_LATEST_COMBOS || {}),
  "smart-model",
]);

export function isBuiltinCombo(combo) {
  const name = (typeof combo === "string" ? combo : combo?.name || "").trim().toLowerCase();
  if (!name) return false;
  if (BUILTIN_COMBO_NAMES.has(name)) return true;
  if (name.endsWith("-latest")) return true;
  if (name === "gemini-flash" || name === "gemini-pro" || name === "claude" || name === "gpt") return true;
  return false;
}

export function getComboBadge(combo, strategy = null) {
  const name = typeof combo === "string" ? combo : combo?.name || "";
  const kind = typeof combo === "object" ? combo?.kind : null;
  const strat = strategy || (typeof combo === "object" ? combo?.strategy : null);

  const isDifficulty = strat?.fallbackStrategy === "difficulty" || name === "smart-model";
  const isFusion = strat?.fallbackStrategy === "fusion";
  const isWebSearch = kind === "webSearch";
  const isWebFetch = kind === "webFetch";
  const isBuiltin = isBuiltinCombo(combo);

  if (isDifficulty) {
    return {
      icon: "auto_awesome",
      label: "Smart Routing",
      type: "difficulty",
      bg: "bg-success/10",
      text: "text-success",
      border: "border-success/20",
      title: "Smart Routing Combo",
    };
  }

  if (isFusion) {
    return {
      icon: "hub",
      label: "Fusion",
      type: "fusion",
      bg: "bg-info/10",
      text: "text-info",
      border: "border-info/20",
      title: "Fusion Combo",
    };
  }

  if (isWebSearch) {
    return {
      icon: "travel_explore",
      label: "Web Search",
      type: "webSearch",
      bg: "bg-warning/10",
      text: "text-warning",
      border: "border-warning/20",
      title: "Web Search Combo",
    };
  }

  if (isWebFetch) {
    return {
      icon: "public",
      label: "Web Fetch",
      type: "webFetch",
      bg: "bg-primary/10",
      text: "text-primary",
      border: "border-primary/20",
      title: "Web Fetch Combo",
    };
  }


  if (isBuiltin) {
    return {
      icon: "verified",
      label: "Preset",
      type: "preset",
      bg: "bg-primary/10",
      text: "text-primary",
      border: "border-primary/20",
      title: "Built-in Preset Combo",
    };
  }

  return {
    icon: "person",
    label: "Custom",
    type: "custom",
    bg: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/20",
    title: "Custom Combo",
  };
}

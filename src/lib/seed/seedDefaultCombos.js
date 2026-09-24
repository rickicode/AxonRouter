// Seed default combos into the DB on first boot.
//
// Built-in combos are a seed source only. Startup inserts a combo whose name
// is missing. Existing rows are not overwritten, so a dashboard edit or delete
// stays deleted.
//
// auto/coding is the only combo that seeds smart (difficulty) routing.
// auto/writing and auto/socmed stay on ordered fallback: member 1, then 2.
// A strategy the dashboard already set is left alone.
import { getComboByName, createCombo } from "@/lib/db/repos/combosRepo.js";
import { getSettings, updateSettings } from "@/lib/db/repos/settingsRepo.js";
import { CORE_MODEL_COMBOS, GENERAL_LATEST_COMBOS } from "open-sse/config/coreModelCombos.js";

const AUTO_CODING_STRATEGY = {
  fallbackStrategy: "difficulty",
  judgeModel: "judge-router",
  difficultyPolicy: "balanced",
  easyModels: [
    "cline-free/cohere/north-mini-code:free",
    "cline-free/google/gemma-4-31b-it:free",
    "cline-free/inclusionai/ling-3.0-flash-fin:free",
    "cline-free/inclusionai/ling-3.0-flash-vl:free",
    "kcf/cohere/north-mini-code:free",
    "kcf/inclusionai/ling-3.0-flash-fin:free",
    "kcf/inclusionai/ling-3.0-flash-vl:free",
  ],
  mediumModels: [
    "cline-free/deepseek/deepseek-v4-flash",
    "cx/gpt-5.5",
    "cx/gpt-5.6-luna",
    "cline-free/poolside/laguna-s-2.1:free",
  ],
  hardModels: [
    "ag/gemini-3.8-flash-high",
    "gcli/grok-4.7",
    "ocz/muse-spark-1.3-contributor-free",
    "cline-free/nex-agi/nex-n2.5-pro:free",
    "kcf/poolside/laguna-s-2.1:free",
  ],
};

const FALLBACK_ONLY_AUTOS = ["auto/writing", "auto/socmed"];

let seeded = false;

export async function seedDefaultCombos() {
  if (seeded) return;
  seeded = true;
  const results = [];
  try {
    const seeds = [
      ...Object.entries(CORE_MODEL_COMBOS),
      ...Object.entries(GENERAL_LATEST_COMBOS),
    ];
    for (const [name, models] of seeds) {
      try {
        const existing = await getComboByName(name);
        if (existing) {
          results.push(`${name}:exists`);
          continue;
        }
        await createCombo({ name, kind: "llm", models });
        results.push(`${name}:created`);
      } catch (err) {
        console.error(`[Seed] combo "${name}" failed:`, err?.message || err);
        results.push(`${name}:error`);
      }
    }

    const settings = await getSettings();
    const current = { ...(settings.comboStrategies || {}) };
    let changed = false;
    if (current["smart-model"]) {
      delete current["smart-model"];
      changed = true;
      results.push("smart-model:strategy-removed");
    }
    for (const name of FALLBACK_ONLY_AUTOS) {
      if (current[name]) {
        delete current[name];
        changed = true;
        results.push(`${name}:fallback`);
      }
    }
    if (!current["auto/coding"]?.fallbackStrategy) {
      current["auto/coding"] = AUTO_CODING_STRATEGY;
      changed = true;
      results.push("auto/coding:strategy");
    } else {
      results.push("auto/coding:strategy-exists");
    }
    if (changed) await updateSettings({ comboStrategies: current });

    console.error(`[Seed] done: ${results.join(", ")}`);
  } catch (error) {
    console.error("[Seed] default combos failed:", error.message);
    seeded = false;
  }
}

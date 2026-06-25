// Auto-seed smart routing combos on first run.
// Uses smart-seed to detect active providers and build combos dynamically.
// Falls back to hardcoded defaults if no providers are configured yet.

import { applySmartSeed, buildSmartSeedCombos } from "./smart-seed";
import { DEFAULT_CONFIG } from "./router";

// Hardcoded fallback combos (used only when no active providers exist yet)
const FALLBACK_COMBOS = [
  {
    name: DEFAULT_CONFIG.targets.small,
    models: ["oc/mimo-v2.5-free", "mimo-free/mimo-auto", "ag/gemini-3.5-flash-low"],
    strategy: "round-robin",
    priority: 10,
    isHidden: true,
  },
  {
    name: DEFAULT_CONFIG.targets.medium,
    models: ["opencode-go/mimo-v2.5-pro", "cx/gpt-5.3-codex", "ag/gemini-3.5-flash-high"],
    strategy: "round-robin",
    priority: 20,
    isHidden: true,
  },
  {
    name: DEFAULT_CONFIG.targets.planning,
    models: ["cx/gpt-5.3-codex-high", "opencode-go/mimo-v2.5-pro", "ag/gemini-3.1-pro-high"],
    strategy: "round-robin",
    priority: 30,
    isHidden: true,
  },
  {
    name: DEFAULT_CONFIG.targets.large,
    models: ["cx/gpt-5.3-codex-xhigh", "ag/claude-opus-4-6-thinking", "opencode-go/deepseek-v4-pro"],
    strategy: "round-robin",
    priority: 40,
    isHidden: true,
  },
  {
    name: DEFAULT_CONFIG.targets.vision,
    models: ["ag/gemini-3.1-pro-high", "cx/gpt-5.3-codex"],
    strategy: "round-robin",
    priority: 50,
    isHidden: true,
  },
];

/**
 * Seed auto combos on startup.
 * 1. Try smart seed (detect active providers)
 * 2. If no providers configured yet, use hardcoded fallbacks
 * Safe to call multiple times — only creates missing combos.
 */
export async function seedAutoCombos(): Promise<void> {
  try {
    // Check if smart seed can find active providers
    const smartCombos = await buildSmartSeedCombos();

    if (smartCombos.length > 0) {
      // Smart seed found providers — use it
      await applySmartSeed();
      return;
    }

    // No providers yet — use fallback combos
    const mod = await import("@/lib/localDb/combos");
    const existing = await mod.getCombos();
    const existingNames = new Set(existing.map((c: { name: string }) => c.name));

    for (const combo of FALLBACK_COMBOS) {
      if (existingNames.has(combo.name)) continue;
      try {
        await mod.createCombo({
          id: `smart-${combo.name}`,
          name: combo.name,
          models: combo.models,
          strategy: combo.strategy,
          priority: combo.priority,
          isHidden: combo.isHidden,
        });
      } catch {
        // Already exists or DB error — skip
      }
    }
  } catch {
    // localDb not available yet — skip seeding
  }
}

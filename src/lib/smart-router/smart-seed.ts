// Smart auto-seed: detect active providers and build combos dynamically
// Called from API endpoint and from initializeApp on first run

import { DEFAULT_CONFIG } from "./router";

// Model tiers: categorize models by capability
// This is the intelligence layer — knows which models are "small", "medium", "large"
const MODEL_TIERS: Record<string, { tier: "small" | "medium" | "large"; reason: string }> = {
  // Free / lightweight models → small
  "mimo-v2.5-free": { tier: "small", reason: "free tier" },
  "mimo-auto": { tier: "small", reason: "free tier" },
  "deepseek-v4-flash-free": { tier: "small", reason: "free tier" },
  "big-pickle": { tier: "small", reason: "free tier" },
  "nemotron-3-super-free": { tier: "small", reason: "free tier" },
  "qwen3.6-plus-free": { tier: "small", reason: "free tier" },
  "minimax-m2.5-free": { tier: "small", reason: "free tier" },
  "gemini-3.5-flash-low": { tier: "small", reason: "flash/low" },
  "gemini-3-flash-preview": { tier: "small", reason: "flash" },
  "gemini-3-flash": { tier: "small", reason: "flash" },
  "gemini-2.5-pro": { tier: "small", reason: "older pro" },
  "gpt-5-nano": { tier: "small", reason: "nano" },
  "gpt-5.4-nano": { tier: "small", reason: "nano" },
  "gpt-5-codex-mini": { tier: "small", reason: "codex mini" },
  "gpt-5.1-codex-mini": { tier: "small", reason: "codex mini" },
  "claude-haiku-4.5": { tier: "small", reason: "haiku" },
  "claude-haiku-4-5-20251001": { tier: "small", reason: "haiku" },
  "qwen3-coder-flash": { tier: "small", reason: "coder flash" },

  // Mid-range models → medium
  "mimo-v2.5": { tier: "medium", reason: "standard" },
  "mimo-v2.5-pro": { tier: "medium", reason: "pro" },
  "deepseek-v4-flash": { tier: "medium", reason: "v4 flash" },
  "deepseek-v3": { tier: "medium", reason: "v3" },
  "deepseek-v3.1": { tier: "medium", reason: "v3.1" },
  "deepseek-v3.2": { tier: "medium", reason: "v3.2" },
  "gemini-3.5-flash-medium": { tier: "medium", reason: "flash medium" },
  "gemini-3.5-flash-high": { tier: "medium", reason: "flash high" },
  "gemini-3.1-pro-low": { tier: "medium", reason: "pro low" },
  "gemini-3.1-pro": { tier: "medium", reason: "pro" },
  "gemini-3.1-pro-preview": { tier: "medium", reason: "pro preview" },
  "gpt-5-codex": { tier: "medium", reason: "codex" },
  "gpt-5.1-codex": { tier: "medium", reason: "codex" },
  "gpt-5.2-codex": { tier: "medium", reason: "codex" },
  "gpt-5.3-codex": { tier: "medium", reason: "codex" },
  "gpt-5.3-codex-spark": { tier: "medium", reason: "codex spark" },
  "gpt-5.3-codex-low": { tier: "medium", reason: "codex low" },
  "gpt-5.2": { tier: "medium", reason: "standard" },
  "gpt-5.4-mini": { tier: "medium", reason: "mini" },
  "gpt-5-mini": { tier: "medium", reason: "mini" },
  "gpt-5.1-codex-mini-high": { tier: "medium", reason: "codex mini high" },
  "claude-sonnet-4": { tier: "medium", reason: "sonnet" },
  "claude-sonnet-4-5-20250929": { tier: "medium", reason: "sonnet" },
  "claude-sonnet-4.5": { tier: "medium", reason: "sonnet" },
  "claude-sonnet-4.6": { tier: "medium", reason: "sonnet" },
  "claude-sonnet-4-6": { tier: "medium", reason: "sonnet" },
  "qwen3-coder-plus": { tier: "medium", reason: "coder plus" },
  "qwen3.6-plus": { tier: "medium", reason: "plus" },
  "qwen3.5-plus": { tier: "medium", reason: "plus" },
  "qwen3.7-max": { tier: "medium", reason: "max" },
  "kimi-k2": { tier: "medium", reason: "kimi" },
  "kimi-k2.5": { tier: "medium", reason: "kimi" },
  "kimi-k2.6": { tier: "medium", reason: "kimi" },
  "glm-5": { tier: "medium", reason: "glm" },
  "glm-5.1": { tier: "medium", reason: "glm" },
  "minimax-m2.5": { tier: "medium", reason: "minimax" },
  "minimax-m2.7": { tier: "medium", reason: "minimax" },
  "gpt-oss-120b-medium": { tier: "medium", reason: "oss" },

  // Large / flagship models → large
  "gpt-5.3-codex-high": { tier: "large", reason: "codex high" },
  "gpt-5.3-codex-xhigh": { tier: "large", reason: "codex xhigh" },
  "gpt-5.1-codex-max": { tier: "large", reason: "codex max" },
  "gpt-5.4": { tier: "large", reason: "flagship" },
  "gpt-5.4-pro": { tier: "large", reason: "pro" },
  "gpt-5.5": { tier: "large", reason: "flagship" },
  "gpt-5.5-pro": { tier: "large", reason: "pro" },
  "claude-opus-4.5": { tier: "large", reason: "opus" },
  "claude-opus-4.6": { tier: "large", reason: "opus" },
  "claude-opus-4.7": { tier: "large", reason: "opus" },
  "claude-opus-4-5-20251101": { tier: "large", reason: "opus" },
  "claude-opus-4-6": { tier: "large", reason: "opus" },
  "claude-opus-4-6-thinking": { tier: "large", reason: "opus thinking" },
  "claude-opus-4-7": { tier: "large", reason: "opus" },
  "gemini-3.1-pro-high": { tier: "large", reason: "pro high" },
  "deepseek-r1": { tier: "large", reason: "reasoning" },
  "deepseek-v4-pro": { tier: "large", reason: "v4 pro" },
  "deepseek-reasoner": { tier: "large", reason: "reasoner" },
  "kimi-k2.5-thinking": { tier: "large", reason: "thinking" },
};

// Provider priority: prefer free/cheap providers first
const PROVIDER_PRIORITY: Record<string, number> = {
  "oc": 10,           // OpenCode Free
  "mimo-free": 10,    // MiMo Free
  "mimo": 20,         // MiMo API Key
  "opencode-go": 20,  // OpenCode Go
  "ag": 25,           // Antigravity
  "mimo-token": 25,   // MiMo Token
  "cx": 30,           // Codex
  "gh": 30,           // GitHub Copilot
  "gc": 30,           // Gemini CLI
  "qw": 30,           // Qwen Code
  "if": 30,           // iFlow
  "cc": 40,           // Claude Code
  "openai": 40,       // OpenAI direct
  "anthropic": 40,    // Anthropic direct
  "google": 40,       // Google direct
  "openrouter": 50,   // OpenRouter
};

interface ProviderConnection {
  id?: string;
  provider?: string;
  label?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

interface ModelInfo {
  id: string;
  name?: string;
  source?: string;
}

function getTier(modelId: string): "small" | "medium" | "large" | null {
  return MODEL_TIERS[modelId]?.tier || null;
}

function modelSortKey(providerAlias: string, modelId: string): number {
  const tier = getTier(modelId);
  const tierScore = tier === "small" ? 0 : tier === "medium" ? 100 : tier === "large" ? 200 : 150;
  const providerScore = PROVIDER_PRIORITY[providerAlias] ?? 99;
  return tierScore + providerScore;
}

/**
 * Build auto-seed combos from currently active provider connections.
 * Scans all active connections, gets their available models, and categorizes by tier.
 */
export async function buildSmartSeedCombos(): Promise<Array<{
  name: string;
  models: string[];
  strategy: string;
  priority: number;
  isHidden: boolean;
}>> {
  // Get active connections and synced models in one import
  let connections: ProviderConnection[] = [];
  let allSyncedModels: Record<string, Record<string, ModelInfo[]>> = {};
  try {
    const localDb = await import("@/lib/localDb");
    connections = await localDb.getProviderConnections({ isActive: true });
    if (connections.length) {
      try { allSyncedModels = await localDb.getAllSyncedAvailableModels(); } catch {}
    }
  } catch {
    return [];
  }

  if (!connections.length) return [];

  // Also get system/static models
  let systemModels: Record<string, ModelInfo[]> = {};
  try {
    const { PROVIDER_MODELS } = await import("@/../open-sse/config/providerModels");
    systemModels = PROVIDER_MODELS;
  } catch {}

  // Build provider → models map from active connections
  const providerModels: Array<{ provider: string; modelId: string; fullId: string }> = [];

  for (const conn of connections) {
    const provider = conn.provider || conn.label || "";
    if (!provider) continue;

    // Get synced models for this connection
    const synced = allSyncedModels[provider];
    if (synced) {
      for (const [, models] of Object.entries(synced)) {
        for (const m of models) {
          if (m?.id) {
            providerModels.push({ provider, modelId: m.id, fullId: `${provider}/${m.id}` });
          }
        }
      }
    }

    // Also add system models for this provider (use Set for O(1) dedup)
    const seen = new Set(providerModels.filter((pm) => pm.provider === provider).map((pm) => pm.modelId));
    const sys = systemModels[provider] || [];
    for (const m of sys) {
      if (m?.id && !seen.has(m.id)) {
        seen.add(m.id);
        providerModels.push({ provider, modelId: m.id, fullId: `${provider}/${m.id}` });
      }
    }
  }

  // Categorize by tier
  const smallModels: typeof providerModels = [];
  const mediumModels: typeof providerModels = [];
  const largeModels: typeof providerModels = [];

  for (const pm of providerModels) {
    const tier = getTier(pm.modelId);
    if (tier === "small") smallModels.push(pm);
    else if (tier === "medium") mediumModels.push(pm);
    else if (tier === "large") largeModels.push(pm);
  }

  // Sort each tier by provider priority
  const sortFn = (a: typeof providerModels[0], b: typeof providerModels[0]) =>
    modelSortKey(a.provider, a.modelId) - modelSortKey(b.provider, b.modelId);

  smallModels.sort(sortFn);
  mediumModels.sort(sortFn);
  largeModels.sort(sortFn);

  // Vision models: large models + any model with "vision" in name
  const visionModels = [
    ...largeModels.filter((m) => getTier(m.modelId) === "large"),
    ...providerModels.filter((m) => /vision|image|vl/i.test(m.modelId)),
  ].slice(0, 5);

  // Build combos — pick top N from each tier
  const targets = DEFAULT_CONFIG.targets;

  const combos: Array<{
    name: string;
    models: string[];
    strategy: string;
    priority: number;
    isHidden: boolean;
  }> = [];

  if (smallModels.length) {
    combos.push({
      name: targets.small,
      models: smallModels.slice(0, 5).map((m) => m.fullId),
      strategy: "round-robin",
      priority: 10,
      isHidden: true,
    });
  }

  if (mediumModels.length) {
    combos.push({
      name: targets.medium,
      models: mediumModels.slice(0, 5).map((m) => m.fullId),
      strategy: "round-robin",
      priority: 20,
      isHidden: true,
    });
  }

  // Planning: medium + large models
  const planningModels = [...mediumModels.slice(0, 3), ...largeModels.slice(0, 3)];
  if (planningModels.length) {
    combos.push({
      name: targets.planning,
      models: planningModels.slice(0, 5).map((m) => m.fullId),
      strategy: "round-robin",
      priority: 30,
      isHidden: true,
    });
  }

  if (largeModels.length) {
    combos.push({
      name: targets.large,
      models: largeModels.slice(0, 5).map((m) => m.fullId),
      strategy: "round-robin",
      priority: 40,
      isHidden: true,
    });
  }

  if (visionModels.length) {
    combos.push({
      name: targets.vision,
      models: visionModels.slice(0, 5).map((m) => m.fullId),
      strategy: "round-robin",
      priority: 50,
      isHidden: true,
    });
  }

  return combos;
}

/**
 * Apply smart seed: create or update auto combos.
 * If combo exists, update its models. If not, create it.
 */
export async function applySmartSeed(): Promise<{
  created: string[];
  updated: string[];
  skipped: string[];
  errors: string[];
}> {
  const result = { created: [] as string[], updated: [] as string[], skipped: [] as string[], errors: [] as string[] };

  const seedCombos = await buildSmartSeedCombos();
  if (!seedCombos.length) {
    result.errors.push("No active provider connections found");
    return result;
  }

  try {
    const mod = await import("@/lib/localDb");
    const existing = await mod.getCombos();
    const existingMap = new Map(existing.map((c: { name: string; id?: string }) => [c.name, c]));

    for (const seed of seedCombos) {
      try {
        const existingCombo = existingMap.get(seed.name) as { name: string; id?: string } | undefined;
        if (existingCombo?.id) {
          // Update models of existing combo
          await mod.updateCombo(existingCombo.id, {
            models: seed.models,
            strategy: seed.strategy,
            priority: seed.priority,
          });
          result.updated.push(seed.name);
        } else {
          // Create new combo
          await mod.createCombo({
            id: `smart-${seed.name}`,
            name: seed.name,
            models: seed.models,
            strategy: seed.strategy,
            priority: seed.priority,
            isHidden: seed.isHidden,
          });
          result.created.push(seed.name);
        }
      } catch (e) {
        result.errors.push(`${seed.name}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    result.errors.push(`DB error: ${(e as Error).message}`);
  }

  return result;
}

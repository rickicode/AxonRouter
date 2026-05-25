import { getPricingForModel } from "@/shared/constants/pricing";

export const DEFAULT_SYSTEM_COMBOS = [
  { name: "auto", priority: 10 },
  { name: "economy", priority: 8 },
  { name: "balanced", priority: 9 },
  { name: "premium", priority: 7 },
];

export function normalizeModelId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function estimateModelCost(fullModelId) {
  if (typeof fullModelId !== "string" || !fullModelId.includes("/")) return Number.POSITIVE_INFINITY;
  const [provider, ...rest] = fullModelId.split("/");
  const model = rest.join("/");
  const pricing = getPricingForModel(provider, model);
  if (!pricing) return Number.POSITIVE_INFINITY;
  return Number(pricing.input || 0) + Number(pricing.output || 0) + Number(pricing.reasoning || 0);
}

function estimateQualityScore(fullModelId) {
  const normalized = String(fullModelId || "").toLowerCase();
  let score = 0;

  const weightedHints: Array<[string, number]> = [
    ["opus", 10],
    ["sonnet", 8],
    ["pro", 7],
    ["reasoning", 7],
    ["reasoner", 7],
    ["thinking", 6],
    ["gpt-5", 8],
    ["gpt-4.1", 6],
    ["gpt-4o", 5],
    ["claude-3-5-sonnet", 6],
    ["gemini-2.5-pro", 7],
    ["gemini-3", 6],
    ["kimi-k2.5", 6],
    ["deepseek-r1", 7],
    ["deepseek-reasoner", 7],
  ];

  const penaltyHints: Array<[string, number]> = [
    ["mini", -5],
    ["flash-lite", -6],
    ["flash", -4],
    ["haiku", -4],
    ["lite", -4],
    ["cheap", -4],
    ["fast", -3],
    ["low", -2],
  ];

  for (const [hint, value] of weightedHints) {
    if (normalized.includes(hint)) score += value;
  }
  for (const [hint, value] of penaltyHints) {
    if (normalized.includes(hint)) score += value;
  }

  return score;
}

function rankModelIds(fullModelIds = []) {
  return [...fullModelIds]
    .map((id) => ({ id, costScore: estimateModelCost(id), qualityScore: estimateQualityScore(id) }))
    .sort((left, right) => {
      if (left.costScore === right.costScore) {
        if (left.qualityScore === right.qualityScore) return left.id.localeCompare(right.id);
        return right.qualityScore - left.qualityScore;
      }
      return left.costScore - right.costScore;
    });
}

function dedupeModelIds(modelIds = []) {
  const seen = new Set();
  const result = [];
  for (const id of modelIds) {
    const normalized = normalizeModelId(id);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function buildDefaultComboModelSets(connections = [], { fallbackModels = [] } = {}) {
  const discovered = [];

  for (const connection of connections || []) {
    const provider = typeof connection?.provider === "string" ? connection.provider.trim() : "";
    const enabledModels = Array.isArray(connection?.providerSpecificData?.enabledModels)
      ? connection.providerSpecificData.enabledModels
      : [];

    for (const modelId of enabledModels) {
      const normalized = normalizeModelId(modelId);
      if (!normalized || !provider) continue;
      discovered.push(`${provider}/${normalized}`);
    }
  }

  const allModels = dedupeModelIds([...discovered, ...fallbackModels]);
  const ranked = rankModelIds(allModels);
  const cheapFirst = ranked.map((entry) => entry.id);
  const premiumFirst = [...ranked]
    .sort((left, right) => {
      if (left.qualityScore === right.qualityScore) return left.costScore - right.costScore;
      return right.qualityScore - left.qualityScore;
    })
    .map((entry) => entry.id);
  const balanced = [...ranked]
    .sort((left, right) => {
      const leftScore = (left.qualityScore * 2) - left.costScore;
      const rightScore = (right.qualityScore * 2) - right.costScore;
      if (leftScore === rightScore) return left.id.localeCompare(right.id);
      return rightScore - leftScore;
    })
    .map((entry) => entry.id);

  return {
    all: allModels,
    balanced: balanced.length > 0 ? balanced : allModels,
    economy: cheapFirst.length > 0 ? cheapFirst : allModels,
    premium: premiumFirst.length > 0 ? premiumFirst : allModels,
  };
}

function toNumber(value: any, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function normalizeModelName(model: any) {
  if (!model || !model.includes("/")) return model;
  const parts = model.split("/");
  return parts[parts.length - 1];
}

export function normalizeUsageTokens(tokens: any = {}) {
  return {
    input: toNumber(tokens.input ?? tokens.prompt_tokens ?? tokens.input_tokens, 0),
    output: toNumber(tokens.output ?? tokens.completion_tokens ?? tokens.output_tokens, 0),
    cacheRead: toNumber(tokens.cacheRead ?? tokens.cached_tokens ?? tokens.cache_read_input_tokens, 0),
    cacheCreation: toNumber(tokens.cacheCreation ?? tokens.cache_creation_input_tokens, 0),
    reasoning: toNumber(tokens.reasoning ?? tokens.reasoning_tokens, 0),
  };
}

export function computeCostFromPricing(pricing: any, tokens: any) {
  if (!pricing || !tokens) return 0;

  const normalizedTokens = normalizeUsageTokens(tokens);
  const inputPrice = toNumber(pricing.input, 0);
  const cachedPrice = toNumber(pricing.cached, inputPrice);
  const outputPrice = toNumber(pricing.output, 0);
  const reasoningPrice = toNumber(pricing.reasoning, outputPrice);
  const cacheCreationPrice = toNumber(pricing.cache_creation, inputPrice);

  const nonCachedInput = Math.max(0, normalizedTokens.input - normalizedTokens.cacheRead);

  let cost = 0;
  cost += nonCachedInput * (inputPrice / 1_000_000);
  cost += normalizedTokens.cacheRead * (cachedPrice / 1_000_000);
  cost += normalizedTokens.output * (outputPrice / 1_000_000);
  cost += normalizedTokens.reasoning * (reasoningPrice / 1_000_000);
  cost += normalizedTokens.cacheCreation * (cacheCreationPrice / 1_000_000);

  return cost;
}

export async function calculateCost(provider: any, model: any, tokens: any) {
  if (!tokens || !provider || !model) return 0;

  try {
    const { getPricingForModel } = await import("../localDb");

    let pricing = await getPricingForModel(provider, model);
    if (!pricing) {
      const normalized = normalizeModelName(model);
      if (normalized !== model) {
        pricing = await getPricingForModel(provider, normalized);
      }
    }

    if (!pricing) return 0;
    return computeCostFromPricing(pricing, tokens);
  } catch (error) {
    console.error("[usage/costCalculator] Failed to calculate cost:", error);
    return 0;
  }
}

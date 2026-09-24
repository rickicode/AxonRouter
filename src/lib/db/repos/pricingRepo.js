import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";

const SCOPE = "pricing";
const CACHE_TTL_MS = 5000;

let cache = { value: null, expiresAt: 0 };

function invalidate() {
  cache = { value: null, expiresAt: 0 };
}

async function getUserPricing() {
  const db = await getAdapter();
  const rows = await db.all("SELECT key, value FROM kv WHERE scope = $1", [SCOPE]);
  const result = {};
  for (const row of rows) result[row.key] = parseJson(row.value, {});
  return result;
}

export async function getPricing() {
  const now = Date.now();
  if (cache.value && cache.expiresAt > now) return cache.value;

  const userPricing = await getUserPricing();
  const { PROVIDER_PRICING } = await import("open-sse/providers/pricing.js");
  const merged = {};

  for (const [provider, models] of Object.entries(PROVIDER_PRICING)) {
    merged[provider] = { ...models };
    if (userPricing[provider]) {
      for (const [model, pricing] of Object.entries(userPricing[provider])) {
        merged[provider][model] = merged[provider][model]
          ? { ...merged[provider][model], ...pricing }
          : pricing;
      }
    }
  }

  for (const [provider, models] of Object.entries(userPricing)) {
    if (!merged[provider]) {
      merged[provider] = { ...models };
    } else {
      for (const [model, pricing] of Object.entries(models)) {
        if (!merged[provider][model]) merged[provider][model] = pricing;
      }
    }
  }

  cache = { value: merged, expiresAt: now + CACHE_TTL_MS };
  return merged;
}

export async function getPricingForModel(provider, model) {
  if (!model) return null;
  const userPricing = await getUserPricing();
  if (provider && userPricing[provider]?.[model]) return userPricing[provider][model];
  const { getPricingForModel: resolveConst } = await import("open-sse/providers/pricing.js");
  return resolveConst(provider, model);
}

export async function updatePricing(pricingData) {
  const db = await getAdapter();

  await db.transaction(async (tx) => {
    for (const [provider, models] of Object.entries(pricingData)) {
      const row = await tx.get(
        "SELECT value FROM kv WHERE scope = $1 AND key = $2",
        [SCOPE, provider],
      );
      const current = row ? parseJson(row.value, {}) || {} : {};
      const merged = { ...current, ...models };
      await tx.run(
        `INSERT INTO kv(scope, key, value)
         VALUES($1, $2, $3)
         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [SCOPE, provider, merged],
      );
    }
  });

  invalidate();
  return await getUserPricing();
}

export async function resetPricing(provider, model) {
  if (!provider) return await getUserPricing();
  const db = await getAdapter();

  await db.transaction(async (tx) => {
    if (!model) {
      await tx.run("DELETE FROM kv WHERE scope = $1 AND key = $2", [SCOPE, provider]);
      return;
    }

    const row = await tx.get(
      "SELECT value FROM kv WHERE scope = $1 AND key = $2",
      [SCOPE, provider],
    );
    const current = row ? parseJson(row.value, {}) || {} : {};
    delete current[model];

    if (Object.keys(current).length === 0) {
      await tx.run("DELETE FROM kv WHERE scope = $1 AND key = $2", [SCOPE, provider]);
    } else {
      await tx.run(
        `INSERT INTO kv(scope, key, value)
         VALUES($1, $2, $3)
         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [SCOPE, provider, current],
      );
    }
  });

  invalidate();
  return await getUserPricing();
}

export async function resetAllPricing() {
  const db = await getAdapter();
  await db.run("DELETE FROM kv WHERE scope = $1", [SCOPE]);
  invalidate();
  return {};
}

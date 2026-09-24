/**
 * UniKey live model catalog fetcher.
 *
 * Fetches available models from UniKey upstream /v1/models endpoint
 * using connection API key. Caches catalog in memory to prevent hammering upstream.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
const catalogCache = new Map();

function parseOpenAIStyleModels(data) {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
}

export async function resolveUnikeyModels(credentials, options = {}) {
  const apiKey = credentials?.apiKey;
  if (!apiKey) return null;

  const now = Date.now();
  if (!options.forceRefresh) {
    const cached = catalogCache.get(apiKey);
    if (cached && cached.expiresAt > now) {
      return cached;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const baseUrl =
      credentials?.providerSpecificData?.baseUrl?.trim()?.replace(/\/$/, "") ||
      "https://www.getunikey.ai/v1";
    const modelsUrl = `${baseUrl}/models`;

    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      options.log?.warn?.(`[UniKey] Failed to fetch models: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const rawList = parseOpenAIStyleModels(data);
    const models = rawList
      .map((m) => {
        const id = m?.id || m?.model || m?.name;
        if (!id || typeof id !== "string") return null;
        return {
          id: id.trim(),
          name: m?.name || id.trim(),
        };
      })
      .filter(Boolean);

    if (models.length === 0) return null;

    const entry = {
      expiresAt: now + CACHE_TTL_MS,
      models,
    };
    catalogCache.set(apiKey, entry);
    return entry;
  } catch (error) {
    clearTimeout(timeoutId);
    options.log?.warn?.("[UniKey] Models fetch error:", error?.message || error);
    return null;
  }
}

export function clearUnikeyCatalog() {
  catalogCache.clear();
}

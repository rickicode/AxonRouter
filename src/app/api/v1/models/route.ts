import { instrumentV1Request } from "@/lib/observability/otel";
import { getConfiguredMorphSettings } from "@/app/api/morph/_shared";
import { getCurrentProviderConnections } from "@/lib/connectionAccess";
import { getCurrentModelAliases } from "@/lib/modelAliasAccess";
import {
  getCurrentCombos,
  getCurrentDisabledModels,
} from "@/lib/modelCatalogAccess";
import { getAggregateProviderModelsByProvider } from "@/lib/providerModels/aggregate";
import { ensureModelSyncSchedulerStarted } from "@/lib/providerModels/bootstrap";
import {
  checkRateLimit,
  getRateLimitHeaders,
  OPEN_MODE_LIMIT_PER_MIN,
  DEFAULT_KEY_LIMIT_PER_MIN,
} from "@/lib/rateLimiter";
import { VIRTUAL_SYSTEM_MODELS } from "@/lib/routing/virtualModelResolver";
import {
  PROVIDER_MODELS,
  PROVIDER_ID_TO_ALIAS,
  getMorphFastModels,
} from "@/shared/constants/models";
import {
  getProviderAlias,
  isAnthropicCompatibleProvider,
  isOpenAICompatibleProvider,
  MORPH_MANAGED_PROVIDER_ID,
} from "@/shared/constants/providers";
import {
  extractApiKey,
  isValidApiKey,
  hasApiKeys,
} from "@/sse/services/apiKeyAuth";

const parseOpenAIStyleModels = (data) => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
};

// Matches provider IDs that are upstream/cross-instance connections (contain a UUID suffix)
const UPSTREAM_CONNECTION_RE = /[-_][0-9a-f]{8,}$/i;
const COMPATIBLE_MODELS_CACHE_TTL_MS = 15_000;
const COMPATIBLE_MODELS_FETCH_TIMEOUT_MS = 2_500;
const FINAL_MODELS_RESPONSE_CACHE_TTL_MS = 10_000;
const compatibleModelsCache = new Map();
const compatibleModelsInFlight = new Map();
let finalModelsResponseCache = null;

function getCompatibleModelsCacheKey(connection) {
  return JSON.stringify({
    provider: connection?.provider || "",
    baseUrl:
      typeof connection?.providerSpecificData?.baseUrl === "string"
        ? connection.providerSpecificData.baseUrl.trim().replace(/\/$/, "")
        : "",
    apiKeySuffix:
      typeof connection?.apiKey === "string" ? connection.apiKey.slice(-8) : "",
  });
}

function getFinalModelsResponseCacheKey(
  connections,
  combos,
  modelAliases,
  disabledModels,
  morphConfigured,
  aggregateProviderModels,
) {
  return JSON.stringify({
    connections: (connections || []).map((connection) => ({
      provider: connection?.provider || "",
      id: connection?.id || "",
      isActive: connection?.isActive !== false,
      prefix: connection?.providerSpecificData?.prefix || "",
      baseUrl: connection?.providerSpecificData?.baseUrl || "",
      enabledModels: Array.isArray(
        connection?.providerSpecificData?.enabledModels,
      )
        ? [...connection.providerSpecificData.enabledModels]
        : [],
      apiKeySuffix:
        typeof connection?.apiKey === "string"
          ? connection.apiKey.slice(-8)
          : "",
    })),
    combos: (combos || []).map((combo) => ({
      name: combo?.name || "",
      strategy: combo?.strategy || "priority",
      sortOrder: combo?.sortOrder || 0,
      modelCount: Array.isArray(combo?.models) ? combo.models.length : 0,
    })),
    virtualModels: Object.keys(VIRTUAL_SYSTEM_MODELS),
    modelAliases:
      modelAliases && typeof modelAliases === "object" ? modelAliases : {},
    disabledModels:
      disabledModels && typeof disabledModels === "object"
        ? disabledModels
        : {},
    aggregateProviderModels:
      aggregateProviderModels && typeof aggregateProviderModels === "object"
        ? aggregateProviderModels
        : {},
    morphConfigured: morphConfigured === true,
  });
}

function readCompatibleModelsCache(connection) {
  const cacheKey = getCompatibleModelsCacheKey(connection);
  const cached = compatibleModelsCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt >= COMPATIBLE_MODELS_CACHE_TTL_MS) {
    compatibleModelsCache.delete(cacheKey);
    return null;
  }
  return cached.modelIds;
}

function writeCompatibleModelsCache(connection, modelIds) {
  compatibleModelsCache.set(getCompatibleModelsCacheKey(connection), {
    modelIds,
    updatedAt: Date.now(),
  });
}

function readFinalModelsResponseCache(cacheKey) {
  if (
    !finalModelsResponseCache ||
    finalModelsResponseCache.cacheKey !== cacheKey
  ) {
    return null;
  }
  if (
    Date.now() - finalModelsResponseCache.updatedAt >=
    FINAL_MODELS_RESPONSE_CACHE_TTL_MS
  ) {
    finalModelsResponseCache = null;
    return null;
  }
  return finalModelsResponseCache.payload;
}

function writeFinalModelsResponseCache(cacheKey, payload) {
  finalModelsResponseCache = {
    cacheKey,
    payload,
    updatedAt: Date.now(),
  };
}

async function fetchCompatibleModelIds(connection) {
  if (!connection?.apiKey) return [];

  const cached = readCompatibleModelsCache(connection);
  if (cached) return cached;

  const cacheKey = getCompatibleModelsCacheKey(connection);
  const inFlight = compatibleModelsInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const fetchPromise = (async () => {
    const baseUrl =
      typeof connection?.providerSpecificData?.baseUrl === "string"
        ? connection.providerSpecificData.baseUrl.trim().replace(/\/$/, "")
        : "";

    if (!baseUrl) return [];

    let url = `${baseUrl}/models`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (isOpenAICompatibleProvider(connection.provider)) {
      headers.Authorization = `Bearer ${connection.apiKey}`;
    } else if (isAnthropicCompatibleProvider(connection.provider)) {
      if (url.endsWith("/messages/models")) {
        url = `${url.slice(0, -16)}/models`;
      } else if (url.endsWith("/messages")) {
        url = `${url.slice(0, -9)}/models`;
      }
      headers["x-api-key"] = connection.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      return [];
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        COMPATIBLE_MODELS_FETCH_TIMEOUT_MS,
      );
      const response = await fetch(url, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) return [];

      const data = await response.json();
      const rawModels = parseOpenAIStyleModels(data);
      const modelIds = Array.from(
        new Set(
          rawModels
            .map((model) => model?.id || model?.name || model?.model)
            .filter(
              (modelId) => typeof modelId === "string" && modelId.trim() !== "",
            ),
        ),
      );

      writeCompatibleModelsCache(connection, modelIds);
      return modelIds;
    } catch {
      return [];
    }
  })();

  compatibleModelsInFlight.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    compatibleModelsInFlight.delete(cacheKey);
  }
}

function normalizeModelIds(rawModelIds, outputAlias, staticAlias, providerId) {
  return rawModelIds
    .map((modelId) => {
      if (typeof modelId !== "string") return "";
      const trimmedModelId = modelId.trim();
      if (!trimmedModelId) return "";
      if (trimmedModelId.startsWith(`${outputAlias}/`)) {
        return trimmedModelId.slice(outputAlias.length + 1);
      }
      if (trimmedModelId.startsWith(`${staticAlias}/`)) {
        return trimmedModelId.slice(staticAlias.length + 1);
      }
      if (trimmedModelId.startsWith(`${providerId}/`)) {
        return trimmedModelId.slice(providerId.length + 1);
      }
      return trimmedModelId;
    })
    .filter((modelId) => typeof modelId === "string" && modelId.trim() !== "");
}

function getAliasBackedModelIds(modelAliases, aliasesToMatch) {
  if (!modelAliases || typeof modelAliases !== "object") return [];
  const aliasSet = new Set(
    (aliasesToMatch || []).filter(
      (alias) => typeof alias === "string" && alias.trim() !== "",
    ),
  );
  if (aliasSet.size === 0) return [];

  return Object.values(modelAliases).flatMap((value) => {
    if (typeof value !== "string" || !value.includes("/")) return [];
    const slashIndex = value.indexOf("/");
    const providerAlias = value.slice(0, slashIndex);
    const modelId = value.slice(slashIndex + 1);
    return aliasSet.has(providerAlias) && modelId ? [modelId] : [];
  });
}

function createMorphProviderEntry() {
  return {
    providerId: MORPH_MANAGED_PROVIDER_ID,
    conn: {
      provider: MORPH_MANAGED_PROVIDER_ID,
      providerSpecificData: {
        prefix: "morph",
        enabledModels: getMorphFastModels().map((model) => model.id),
      },
    },
    staticAlias: "morph",
    outputAlias: "morph",
    providerModels: getMorphFastModels().map((model) => ({ id: model.id })),
  };
}

async function resolveProviderModelIds(
  providerEntries,
  modelAliases,
  disabledModels,
) {
  const remoteResults = await Promise.allSettled(
    providerEntries.map(async (entry) => {
      const { providerId, conn, providerModels } = entry;
      const enabledModels = conn?.providerSpecificData?.enabledModels;
      const hasExplicitEnabledModels =
        Array.isArray(enabledModels) && enabledModels.length > 0;
      const isCompatibleProvider =
        isOpenAICompatibleProvider(providerId) ||
        isAnthropicCompatibleProvider(providerId);

      let rawModelIds = hasExplicitEnabledModels
        ? Array.from(
            new Set(
              enabledModels.filter(
                (modelId) =>
                  typeof modelId === "string" && modelId.trim() !== "",
              ),
            ),
          )
        : providerModels.map((model) => model.id);

      if (providerId === MORPH_MANAGED_PROVIDER_ID) {
        rawModelIds = rawModelIds.concat(
          providerModels.map((model) => model.id),
        );
      }

      const aliasBackedModelIds = getAliasBackedModelIds(modelAliases, [
        entry.outputAlias,
        entry.staticAlias,
        providerId,
      ]);
      if (aliasBackedModelIds.length > 0) {
        rawModelIds = rawModelIds.concat(aliasBackedModelIds);
      }

      if (
        isCompatibleProvider &&
        rawModelIds.length === 0 &&
        !UPSTREAM_CONNECTION_RE.test(providerId)
      ) {
        rawModelIds = await fetchCompatibleModelIds(conn);
      }

      const normalizedModelIds = normalizeModelIds(
        rawModelIds,
        entry.outputAlias,
        entry.staticAlias,
        providerId,
      );
      const disabledSet = new Set([
        ...(disabledModels?.[entry.outputAlias] || []),
        ...(disabledModels?.[entry.staticAlias] || []),
        ...(disabledModels?.[providerId] || []),
      ]);

      return {
        ...entry,
        modelIds: normalizedModelIds.filter(
          (modelId) => !disabledSet.has(modelId),
        ),
      };
    }),
  );

  return remoteResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * GET /v1/models - compatible models list
 * Returns models from all active providers and combos in OpenAI format
 */
export async function GET(request: Request) {
  return instrumentV1Request(request, "models", async () => {
    try {
      const apiKey = extractApiKey(request);
      const keysConfigured = await hasApiKeys();
      if (keysConfigured && !apiKey)
        return new Response(
          JSON.stringify({
            error: { message: "Missing API key", type: "auth_error" },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      if (keysConfigured && apiKey && !(await isValidApiKey(apiKey)))
        return new Response(
          JSON.stringify({
            error: { message: "Invalid API key", type: "auth_error" },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );

      // Rate limiting
      const rateLimitId =
        apiKey ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown-ip";
      const rateLimitMax = apiKey
        ? DEFAULT_KEY_LIMIT_PER_MIN
        : OPEN_MODE_LIMIT_PER_MIN;
      const rateResult = checkRateLimit(rateLimitId, rateLimitMax);
      if (!rateResult.allowed) {
        return new Response(
          JSON.stringify({
            error: { message: "Rate limit exceeded", type: "rate_limit_error" },
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              ...getRateLimitHeaders(rateResult, rateLimitMax),
            },
          },
        );
      }

      // Ensure model sync scheduler is running (fire-and-forget, non-blocking)
      ensureModelSyncSchedulerStarted().catch(() => {});

      const [
        connectionsResult,
        combosResult,
        modelAliasesResult,
        disabledModelsResult,
        aggregateProviderModelsResult,
      ] = await Promise.allSettled([
        getCurrentProviderConnections(),
        getCurrentCombos(),
        getCurrentModelAliases(),
        getCurrentDisabledModels(),
        getAggregateProviderModelsByProvider(),
      ]);

      let connections = [];
      if (connectionsResult.status === "fulfilled") {
        connections = Array.isArray(connectionsResult.value)
          ? connectionsResult.value.filter(
              (connection) => connection.isActive !== false,
            )
          : [];
      } else {
        console.log("Could not fetch providers, returning all models");
      }

      let combos = [];
      if (combosResult.status === "fulfilled") {
        combos = Array.isArray(combosResult.value) ? combosResult.value : [];
      } else {
        console.log("Could not fetch combos");
      }

      const modelAliases =
        modelAliasesResult.status === "fulfilled" &&
        modelAliasesResult.value &&
        typeof modelAliasesResult.value === "object"
          ? modelAliasesResult.value
          : {};
      const disabledModels =
        disabledModelsResult.status === "fulfilled" &&
        disabledModelsResult.value &&
        typeof disabledModelsResult.value === "object"
          ? disabledModelsResult.value
          : {};
      const aggregateProviderModels =
        aggregateProviderModelsResult.status === "fulfilled" &&
        aggregateProviderModelsResult.value &&
        typeof aggregateProviderModelsResult.value === "object"
          ? aggregateProviderModelsResult.value
          : {};

      const morphSettings = await getConfiguredMorphSettings();
      const morphConfigured = !!morphSettings;

      const finalCacheKey = getFinalModelsResponseCacheKey(
        connections,
        combos,
        modelAliases,
        disabledModels,
        morphConfigured,
        aggregateProviderModels,
      );
      const cachedPayload = readFinalModelsResponseCache(finalCacheKey);
      if (cachedPayload) {
        return Response.json(cachedPayload, {
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Build first active connection per provider (connections already sorted by priority)
      const activeConnectionByProvider = new Map();
      for (const conn of connections) {
        if (!activeConnectionByProvider.has(conn.provider)) {
          activeConnectionByProvider.set(conn.provider, conn);
        }
      }

      // Collect models from active providers (or all if none active)
      const models = [];
      const timestamp = Math.floor(Date.now() / 1000);

      // Add virtual system models first
      for (const virtualModel of Object.values(VIRTUAL_SYSTEM_MODELS)) {
        models.push({
          id: virtualModel.id,
          object: "model",
          created: timestamp,
          owned_by: "system",
          permission: [],
          root: virtualModel.id,
          parent: null,
        });
      }

      // Add combos next (they appear near the top) — exclude hidden combos
      for (const combo of combos) {
        if (combo.isHidden) continue;
        models.push({
          id: combo.name,
          object: "model",
          created: timestamp,
          owned_by: "combo",
          permission: [],
          root: combo.name,
          parent: null,
        });
      }

      // Add provider models
      if (connections.length === 0) {
        // No active providers: expose the aggregate baseline instead of manually
        // reassembling a second registry-centric model list in this route.
        for (const [providerAlias, providerModels] of Object.entries(
          aggregateProviderModels,
        )) {
          for (const model of providerModels || []) {
            if (!model?.id) continue;
            models.push({
              id: `${providerAlias}/${model.id}`,
              object: "model",
              created: timestamp,
              owned_by: providerAlias,
              permission: [],
              root: model.id,
              parent: null,
              ...(model.name ? { name: model.name } : {}),
            });
          }
        }

        if (morphConfigured) {
          for (const model of getMorphFastModels()) {
            models.push({
              id: `morph/${model.id}`,
              object: "model",
              created: timestamp,
              owned_by: "morph",
              permission: [],
              root: model.id,
              parent: null,
              name: model.name,
            });
          }
        }
      } else {
        const providerEntries = Array.from(
          activeConnectionByProvider.entries(),
        ).map(([providerId, conn]) => {
          const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
          const outputAlias = (
            conn?.providerSpecificData?.prefix ||
            getProviderAlias(providerId) ||
            staticAlias
          ).trim();
          const providerModels =
            providerId === MORPH_MANAGED_PROVIDER_ID
              ? getMorphFastModels().map((model) => ({ id: model.id }))
              : aggregateProviderModels[providerId] || [];

          return {
            providerId,
            conn,
            staticAlias,
            outputAlias,
            providerModels,
          };
        });

        if (
          morphConfigured &&
          !activeConnectionByProvider.has(MORPH_MANAGED_PROVIDER_ID)
        ) {
          providerEntries.push(createMorphProviderEntry());
        }

        const resolvedProviderEntries = await resolveProviderModelIds(
          providerEntries,
          modelAliases,
          disabledModels,
        );

        for (const entry of resolvedProviderEntries) {
          for (const modelId of entry.modelIds) {
            models.push({
              id: `${entry.outputAlias}/${modelId}`,
              object: "model",
              created: timestamp,
              owned_by: entry.outputAlias,
              permission: [],
              root: modelId,
              parent: null,
            });
          }
        }
      }

      const dedupedModels = Array.from(
        new Map(models.map((model) => [model.id, model])).values(),
      );

      const payload = {
        object: "list",
        data: dedupedModels,
      };
      writeFinalModelsResponseCache(finalCacheKey, payload);

      return Response.json(payload, {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.log("Error fetching models:", error);
      return Response.json(
        { error: { message: error.message, type: "server_error" } },
        { status: 500 },
      );
    }
  });
}

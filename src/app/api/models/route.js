import { NextResponse } from "@/lib/http/response.js";
import { getModelAliases, setModelAlias, getCustomModels } from "@/models";
import { getDisabledModels } from "@/lib/disabledModelsDb";
import { AI_MODELS } from "@/shared/constants/config";
import { getProviderAlias } from "@/shared/constants/providers";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";

// GET /api/models - Get models with aliases
// The payload is expensive to build (2,600+ capability lookups ≈ 600 ms on ARM)
// and identical for every caller, so memoize it in-process and refresh with
// stale-while-revalidate: expired entries are served instantly while a
// background rebuild runs, so no request ever blocks on the capability scan.
let cachedModelsList = null;
let cachedModelsExpiresAt = 0;
let modelsRefresh = null;
const MODELS_CACHE_TTL_MS = 300_000; // 5 min; mutations call invalidateModelsCache()

export function invalidateModelsCache() {
  // Expire only — stale payload keeps serving while a refresh runs.
  cachedModelsExpiresAt = 0;
}

async function buildModelsList() {
    const modelAliases = await getModelAliases();
    const disabled = await getDisabledModels();

    const models = AI_MODELS
      .filter((m) => {
        const alias = getProviderAlias(m.provider) || m.provider;
        const list = disabled[alias] || disabled[m.provider] || [];
        return !list.includes(m.model);
      })
      .map((m) => {
        const fullModel = `${m.provider}/${m.model}`;
        const providerAlias = getProviderAlias(m.provider) || m.provider;
        const routedModel = `${providerAlias}/${m.model}`;
        const c = getCapabilitiesForModel(m.provider, m.model);
        return {
          ...m,
          fullModel,
          routedModel,
          alias: modelAliases[fullModel] || m.model,
          caps: {
            vision: c.vision,
            search: c.search,
            reasoning: c.reasoning,
            contextWindow: c.contextWindow,
            maxOutput: c.maxOutput,
          },
        };
      });

    // Custom models ride along; their stored caps override the name heuristic
    const seenFull = new Set(models.map((m) => m.fullModel));
    const customModels = (await getCustomModels()).filter((m) => {
      if (!m?.id || (m.kind || m.type || "llm") !== "llm") return false;
      return !seenFull.has(`${m.providerAlias}/${m.id}`);
    });
    for (const m of customModels) {
      const fullModel = `${m.providerAlias}/${m.id}`;
      const c = getCapabilitiesForModel(m.providerAlias, m.id);
      models.push({
        provider: m.providerAlias,
        model: m.id,
        name: m.name || m.id,
        fullModel,
        routedModel: fullModel,
        alias: modelAliases[fullModel] || m.id,
        caps: {
          vision: c.vision,
          search: c.search,
          reasoning: c.reasoning,
          contextWindow: c.contextWindow,
          maxOutput: c.maxOutput,
          ...(m.caps || {}),
        },
      });
    }

    // Include combos so dashboard tools and model selectors see auto/coding etc.
    try {
      const { getCombos } = await import("@/lib/localDb");
      const combos = await getCombos();
      for (const combo of combos) {
        if (combo.kind && combo.kind !== "llm") continue;
        models.push({
          provider: "combo",
          model: combo.name,
          name: combo.name,
          fullModel: combo.name,
          routedModel: combo.name,
          alias: combo.name,
          caps: {
            vision: true,
            search: false,
            reasoning: true,
            contextWindow: combo.contextWindow || 250000,
            maxOutput: combo.maxTokens || 32768,
          },
        });
      }
    } catch {}

    cachedModelsList = models;
    cachedModelsExpiresAt = Date.now() + MODELS_CACHE_TTL_MS;
    return models;
}

function startModelsRefresh() {
  if (!modelsRefresh) {
    modelsRefresh = buildModelsList()
      .catch((error) => {
        console.log("Error fetching models:", error);
      })
      .finally(() => {
        modelsRefresh = null;
      });
  }
  return modelsRefresh;
}

export async function GET() {
  if (cachedModelsList && Date.now() < cachedModelsExpiresAt) {
    return NextResponse.json({ models: cachedModelsList });
  }
  const pending = startModelsRefresh();
  if (cachedModelsList) {
    // Stale-while-revalidate: serve the cached list instantly, rebuild in background.
    return NextResponse.json({ models: cachedModelsList });
  }
  await pending;
  if (!cachedModelsList) {
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
  return NextResponse.json({ models: cachedModelsList });
}

// PUT /api/models - Update model alias
export async function PUT(request) {
  try {
    const body = await request.json();
    const { model, alias } = body;

    if (!model || !alias) {
      return NextResponse.json({ error: "Model and alias required" }, { status: 400 });
    }

    const modelAliases = await getModelAliases();

    // Check if alias already exists for different model
    const existingModel = Object.entries(modelAliases).find(
      ([key, val]) => val === alias && key !== model
    );

    if (existingModel) {
      return NextResponse.json({ error: "Alias already in use" }, { status: 400 });
    }

    // Update alias
    await setModelAlias(model, alias);
    invalidateModelsCache();

    return NextResponse.json({ success: true, model, alias });
  } catch (error) {
    console.log("Error updating alias:", error);
    return NextResponse.json({ error: "Failed to update alias" }, { status: 500 });
  }
}

import {
  getCurrentCustomModels,
  getCurrentSyncedAvailableModelsForConnection,
  replaceCurrentSyncedAvailableModelsForConnection,
} from "@/lib/modelCatalogAccess";
import { normalizeDiscoveredModels } from "@/lib/providerModels/modelDiscovery";

function toNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeManagedSource(source) {
  const normalized = toNonEmptyString(source)?.toLowerCase();
  if (normalized === "api-sync" || normalized === "auto-sync" || normalized === "imported") {
    return "imported";
  }
  return normalized || "manual";
}

function normalizeImportedModels(fetchedModels) {
  const discovered = normalizeDiscoveredModels(fetchedModels);

  return discovered.map((model) => ({
    id: model.id,
    name: model.name || model.id,
    source: "imported",
    apiFormat: toNonEmptyString(model.apiFormat) || "chat-completions",
    ...(Array.isArray(model.supportedEndpoints) && model.supportedEndpoints.length > 0
      ? { supportedEndpoints: model.supportedEndpoints }
      : {}),
    ...(typeof model.inputTokenLimit === "number" ? { inputTokenLimit: model.inputTokenLimit } : {}),
    ...(typeof model.outputTokenLimit === "number" ? { outputTokenLimit: model.outputTokenLimit } : {}),
    ...(typeof model.description === "string" ? { description: model.description } : {}),
    ...(model.supportsThinking === true ? { supportsThinking: true } : {}),
  }));
}

function summarizeImportedChanges(previousModels, nextModels, importedIds) {
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  const previousMap = new Map(previousModels.map((model) => [String(model.id), model]));
  const nextMap = new Map(nextModels.map((model) => [String(model.id), model]));

  const toComparable = (model) => {
    if (!model) return null;
    const id = toNonEmptyString(model.id) || "";
    const supportedEndpoints = Array.isArray(model.supportedEndpoints)
      ? Array.from(new Set(model.supportedEndpoints.filter(Boolean))).sort()
      : ["chat"];
    return {
      id,
      name: toNonEmptyString(model.name) || id,
      source: normalizeManagedSource(model.source),
      apiFormat: toNonEmptyString(model.apiFormat) || "chat-completions",
      supportedEndpoints,
    };
  };

  for (const id of importedIds) {
    const previous = previousMap.get(id);
    const next = nextMap.get(id);
    if (!next) continue;
    if (!previous) {
      added += 1;
      continue;
    }
    if (JSON.stringify(toComparable(previous)) === JSON.stringify(toComparable(next))) {
      unchanged += 1;
      continue;
    }
    updated += 1;
  }

  return { added, updated, unchanged, total: added + updated };
}

export async function importManagedModels({
  providerId,
  connectionId,
  fetchedModels,
  previousSyncedAvailableModels: previousSyncedAvailableModelsInput,
}) {
  const previousModels = await getCurrentCustomModels();
  const previousSyncedAvailableModels =
    previousSyncedAvailableModelsInput ??
    (await getCurrentSyncedAvailableModelsForConnection(providerId, connectionId));
  const discoveredModels = normalizeDiscoveredModels(fetchedModels);
  const importedModels = normalizeImportedModels(fetchedModels);
  const importedIds = new Set(importedModels.map((model) => model.id));

  const syncedAvailableModels = await replaceCurrentSyncedAvailableModelsForConnection(
    providerId,
    connectionId,
    discoveredModels
  );

  const importedChanges = summarizeImportedChanges(
    previousSyncedAvailableModels,
    discoveredModels,
    importedIds
  );

  return {
    previousModels,
    previousSyncedAvailableModels,
    persistedModels: previousModels,
    importedModels,
    discoveredModels,
    syncedAvailableModels,
    syncedAliases: 0,
    importedChanges,
  };
}

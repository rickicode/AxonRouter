import {
  getCurrentSyncedAvailableModelsForConnection,
  replaceCurrentSyncedAvailableModelsForConnection,
} from "@/lib/modelCatalogAccess";

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function toNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function isAutoFetchModelsEnabled(providerSpecificData) {
  const data = isPlainObject(providerSpecificData) ? providerSpecificData : {};
  return data.autoFetchModels !== false;
}

export function normalizeDiscoveredModels(models) {
  const items = Array.isArray(models) ? models : [];
  const deduped = new Map();

  for (const item of items) {
    const record = isPlainObject(item) ? item : {};
    const id =
      toNonEmptyString(record.id) ||
      toNonEmptyString(record.name) ||
      toNonEmptyString(record.model);
    if (!id) continue;

    const name =
      toNonEmptyString(record.name) ||
      toNonEmptyString(record.displayName) ||
      toNonEmptyString(record.model) ||
      id;
    const supportedEndpoints = Array.isArray(record.supportedEndpoints)
      ? Array.from(
          new Set(
            record.supportedEndpoints
              .map((endpoint) => toNonEmptyString(endpoint))
              .filter(Boolean)
          )
        ).sort()
      : undefined;

    deduped.set(id, {
      id,
      name,
      source: "imported",
      ...(toNonEmptyString(record.apiFormat) ? { apiFormat: toNonEmptyString(record.apiFormat) } : {}),
      ...(supportedEndpoints && supportedEndpoints.length > 0 ? { supportedEndpoints } : {}),
      ...(typeof record.inputTokenLimit === "number" ? { inputTokenLimit: record.inputTokenLimit } : {}),
      ...(typeof record.outputTokenLimit === "number" ? { outputTokenLimit: record.outputTokenLimit } : {}),
      ...(typeof record.description === "string" ? { description: record.description } : {}),
      ...(record.supportsThinking === true ? { supportsThinking: true } : {}),
    });
  }

  return Array.from(deduped.values());
}

export async function getCachedDiscoveredModels(providerId, connectionId) {
  return getCurrentSyncedAvailableModelsForConnection(providerId, connectionId);
}

export async function persistDiscoveredModels(providerId, connectionId, models) {
  const normalized = normalizeDiscoveredModels(models);
  await replaceCurrentSyncedAvailableModelsForConnection(providerId, connectionId, normalized);
  return normalized;
}

/**
 * Auto-sync models for noAuth providers that have a modelsFetcher config.
 * These providers don't have DB connections, so we fetch directly from their
 * public models endpoint and persist to syncedAvailableModels with a synthetic connectionId.
 */
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { normalizeDiscoveredModels } from "@/lib/providerModels/modelDiscovery";
import {
  replaceCurrentSyncedAvailableModelsForConnection,
} from "@/lib/modelCatalogAccess";

const NOAUTH_CONNECTION_ID = "__noauth__";
const FETCH_TIMEOUT_MS = 10_000;

type ModelsFetcher = { url: string; type: string };
type NoAuthProvider = { id: string; alias: string; modelsFetcher: ModelsFetcher; [key: string]: unknown };

function getNoAuthProvidersWithFetcher(): NoAuthProvider[] {
  return Object.values(AI_PROVIDERS).filter(
    (p: any) => p.noAuth === true && p.modelsFetcher?.url
  ) as unknown as NoAuthProvider[];
}

function parseModelsResponse(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown> | null;
  return (obj?.data ?? obj?.models ?? []) as unknown[];
}

async function fetchProviderModels(fetcher: ModelsFetcher): Promise<unknown[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(fetcher.url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeoutId);
    if (!res.ok) return [];
    const json = await res.json();
    return parseModelsResponse(json);
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

const OPENCODE_FREE_ALLOWLIST = new Set(["big-pickle"]);

function filterFreeModels(models: unknown[], fetcherType: string): unknown[] {
  if (fetcherType !== "opencode-free") return models;
  return models.filter((m: any) => {
    const id = typeof m?.id === "string" ? m.id : "";
    return id.endsWith("-free") || OPENCODE_FREE_ALLOWLIST.has(id);
  });
}

export type NoAuthSyncResult = {
  providerId: string;
  ok: boolean;
  count: number;
  error?: string;
};

export async function syncNoAuthProviderModels(providerId?: string): Promise<NoAuthSyncResult[]> {
  const providers = getNoAuthProvidersWithFetcher();
  const targets = providerId
    ? providers.filter((p) => p.id === providerId)
    : providers;

  const results: NoAuthSyncResult[] = [];

  for (const provider of targets) {
    try {
      const rawModels = await fetchProviderModels(provider.modelsFetcher);
      if (rawModels.length === 0) {
        results.push({ providerId: provider.id, ok: false, count: 0, error: "No models returned" });
        continue;
      }
      const filteredModels = filterFreeModels(rawModels, provider.modelsFetcher.type);
      if (filteredModels.length === 0) {
        results.push({ providerId: provider.id, ok: false, count: 0, error: "No free models found after filtering" });
        continue;
      }
      const normalized = normalizeDiscoveredModels(filteredModels);
      await replaceCurrentSyncedAvailableModelsForConnection(
        provider.id,
        NOAUTH_CONNECTION_ID,
        normalized,
      );
      results.push({ providerId: provider.id, ok: true, count: normalized.length });
    } catch (error) {
      results.push({
        providerId: provider.id,
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

export { NOAUTH_CONNECTION_ID };

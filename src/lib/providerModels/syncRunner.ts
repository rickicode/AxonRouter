import {
  getCurrentProviderConnections,
  getCurrentSettings,
  updateCurrentSettings,
} from "@/lib/settingsAccess";
import { syncNoAuthProviderModels } from "@/lib/providerModels/noAuthSync";
import { getDefaultAxonRouterBaseUrl, DEFAULT_AXONROUTER_PORT } from "@/shared/constants/runtimeDefaults";

function shouldSyncConnection(connection, modelSyncSettings) {
  if (!connection?.id || !connection?.provider) return false;
  if (connection.isActive === false) return false;

  const providerCfg = modelSyncSettings?.providers?.[connection.provider];
  if (providerCfg && providerCfg.enabled === false) return false;

  return true;
}

export async function getEligibleModelSyncConnections() {
  const [connections, settings] = await Promise.all([
    getCurrentProviderConnections(),
    getCurrentSettings(),
  ]);

  const modelSyncSettings = settings?.modelSync || {};
  if (modelSyncSettings.enabled !== true) return [];

  return (Array.isArray(connections) ? connections : []).filter((connection) =>
    shouldSyncConnection(connection, modelSyncSettings)
  );
}

export async function runModelSyncBatch({ fetchImpl = fetch } = {}) {
  const eligibleConnections = await getEligibleModelSyncConnections();
  const startedAt = new Date().toISOString();
  const baseUrl = process.env.BASE_URL || getDefaultAxonRouterBaseUrl(process.env.PORT || DEFAULT_AXONROUTER_PORT);

  const results = [];
  for (const connection of eligibleConnections) {
    try {
      const response = await fetchImpl(`${baseUrl}/api/providers/${encodeURIComponent(connection.id)}/sync-models`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      results.push({
        connectionId: connection.id,
        provider: connection.provider,
        ok: response.ok,
        payload,
      });
    } catch (error) {
      results.push({
        connectionId: connection.id,
        provider: connection.provider,
        ok: false,
        payload: { error: error?.message || "Failed to sync models" },
      });
    }
  }

  // Always sync noAuth providers (they don't need connections or enabled flag)
  const noAuthResults = await syncNoAuthProviderModels();
  for (const r of noAuthResults) {
    results.push({
      connectionId: "__noauth__",
      provider: r.providerId,
      ok: r.ok,
      payload: { syncedCount: r.count, error: r.error },
    });
  }

  const failed = results.filter((result) => !result.ok);
  const status = failed.length === 0 ? "success" : (results.length > 0 ? "partial" : "idle");
  const message = failed.length === 0
    ? `Synced ${results.length} connection${results.length === 1 ? "" : "s"}.`
    : `Synced ${results.length - failed.length}/${results.length} connections.`;

  await updateCurrentSettings({
    modelSync: {
      ...(await getCurrentSettings()).modelSync,
      lastRunAt: startedAt,
      lastRunStatus: status,
      lastRunMessage: message,
    },
  });

  return {
    startedAt,
    status,
    message,
    results,
  };
}

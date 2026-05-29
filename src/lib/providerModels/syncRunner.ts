import { getCurrentProviderConnections } from "@/lib/settingsAccess";
import { syncNoAuthProviderModels } from "@/lib/providerModels/noAuthSync";
import {
	getDefaultAxonRouterBaseUrl,
	DEFAULT_AXONROUTER_PORT,
} from "@/shared/constants/runtimeDefaults";

/**
 * Sync models for a single connection by calling its sync-models endpoint.
 * Fire-and-forget — does not throw on failure.
 */
async function syncSingleConnection(
	baseUrl: string,
	connectionId: string,
	provider: string,
	fetchImpl: typeof fetch,
) {
	try {
		const response = await fetchImpl(
			`${baseUrl}/api/providers/${encodeURIComponent(connectionId)}/sync-models`,
			{
				method: "POST",
			},
		);
		const payload = await response.json().catch(() => ({}));
		return { connectionId, provider, ok: response.ok, payload };
	} catch (error) {
		return {
			connectionId,
			provider,
			ok: false,
			payload: {
				error: error instanceof Error ? error.message : "Failed to sync models",
			},
		};
	}
}

/**
 * Sync models for a specific connection. Fire-and-forget, returns the result.
 */
export async function syncConnectionModels(
	connectionId: string,
	provider: string,
) {
	const baseUrl =
		process.env.BASE_URL ||
		getDefaultAxonRouterBaseUrl(process.env.PORT || DEFAULT_AXONROUTER_PORT);
	return syncSingleConnection(baseUrl, connectionId, provider, fetch);
}

/**
 * Sync models for all active provider connections, plus noAuth providers.
 * Returns a summary of results.
 */
export async function runModelSyncBatch({ fetchImpl = fetch } = {}) {
	const connections = await getCurrentProviderConnections();
	const baseUrl =
		process.env.BASE_URL ||
		getDefaultAxonRouterBaseUrl(process.env.PORT || DEFAULT_AXONROUTER_PORT);

	const activeConnections = (
		Array.isArray(connections) ? connections : []
	).filter((c) => c?.id && c?.provider && c.isActive !== false);

	const results = [];
	for (const connection of activeConnections) {
		const result = await syncSingleConnection(
			baseUrl,
			connection.id,
			connection.provider,
			fetchImpl,
		);
		results.push(result);
	}

	// Always sync noAuth providers (they don't need connections)
	const noAuthResults = await syncNoAuthProviderModels();
	for (const r of noAuthResults) {
		results.push({
			connectionId: "__noauth__",
			provider: r.providerId,
			ok: r.ok,
			payload: { syncedCount: r.count, error: r.error },
		});
	}

	const failed = results.filter((r) => !r.ok);
	const status =
		failed.length === 0 ? "success" : results.length > 0 ? "partial" : "idle";
	const message =
		failed.length === 0
			? `Synced ${results.length} connection${results.length === 1 ? "" : "s"}.`
			: `Synced ${results.length - failed.length}/${results.length} connections.`;

	return {
		startedAt: new Date().toISOString(),
		status,
		message,
		results,
	};
}

import { getCurrentProviderConnectionById } from "@/lib/connectionAccess";
import { refreshUsageWithTransientSkip } from "@/lib/usageRefreshAccess";
import { syncConnectionModels } from "@/lib/providerModels/syncRunner";

type ConnectionRecord = {
	id?: string | null;
	[key: string]: unknown;
};

export async function finalizePostConnectValidation(
	connection: ConnectionRecord,
	logLabel = "OAuth",
) {
	if (!connection?.id) return connection;

	try {
		await refreshUsageWithTransientSkip(connection.id, {
			runConnectionTest: true,
		});

		// Auto-sync models for the newly created connection (fire-and-forget, non-blocking)
		syncConnectionModels(connection.id, connection.provider as string).catch(
			() => {},
		);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(
			`[${logLabel}] Post-connect validation failed for ${connection.id}: ${message}`,
		);
	}

	return (await getCurrentProviderConnectionById(connection.id)) || connection;
}

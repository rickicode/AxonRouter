import { getCurrentProviderConnectionById } from "@/lib/connectionAccess";
import { refreshUsageWithTransientSkip } from "@/lib/usageRefreshAccess";

type ConnectionRecord = {
  id?: string | null;
  [key: string]: unknown;
};

export async function finalizePostConnectValidation(
  connection: ConnectionRecord,
  logLabel = "OAuth"
) {
  if (!connection?.id) return connection;

  try {
    await refreshUsageWithTransientSkip(connection.id, {
      runConnectionTest: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[${logLabel}] Post-connect validation failed for ${connection.id}: ${message}`);
  }

  return (await getCurrentProviderConnectionById(connection.id)) || connection;
}

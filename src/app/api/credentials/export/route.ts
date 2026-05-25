import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentProviderConnections } from "@/lib/connectionAccess";

type ConnectionRecord = Record<string, unknown>;
type CredentialBackupRecord = Partial<Record<CredentialKey, unknown>>;

type CredentialKey =
  | "id"
  | "provider"
  | "authType"
  | "name"
  | "displayName"
  | "email"
  | "priority"
  | "isActive"
  | "defaultModel"
  | "globalPriority"
  | "accessToken"
  | "refreshToken"
  | "idToken"
  | "apiKey"
  | "expiresAt"
  | "expiresIn"
  | "tokenType"
  | "scope"
  | "projectId"
  | "providerSpecificData"
  | "routingStatus"
  | "quotaState"
  | "healthStatus"
  | "authState"
  | "reasonCode"
  | "reasonDetail"
  | "nextRetryAt"
  | "resetAt"
  | "lastCheckedAt"
  | "usageSnapshot"
  | "version"
  | "lastUsedAt"
  | "consecutiveUseCount"
  | "backoffLevel";

function hasCredentialData(connection: ConnectionRecord | null | undefined): boolean {
  return Boolean(
    connection?.accessToken ||
      connection?.refreshToken ||
      connection?.idToken ||
      connection?.apiKey ||
      connection?.projectId ||
      connection?.providerSpecificData,
  );
}

function toCredentialBackupRecord(connection: ConnectionRecord): CredentialBackupRecord {
  const keys: CredentialKey[] = [
    "id",
    "provider",
    "authType",
    "name",
    "displayName",
    "email",
    "priority",
    "isActive",
    "defaultModel",
    "globalPriority",
    "accessToken",
    "refreshToken",
    "idToken",
    "apiKey",
    "expiresAt",
    "expiresIn",
    "tokenType",
    "scope",
    "projectId",
    "providerSpecificData",
    "routingStatus",
    "quotaState",
    "healthStatus",
    "authState",
    "reasonCode",
    "reasonDetail",
    "nextRetryAt",
    "resetAt",
    "lastCheckedAt",
    "usageSnapshot",
    "version",
    "lastUsedAt",
    "consecutiveUseCount",
    "backoffLevel",
  ];

  const record: CredentialBackupRecord = {};
  for (const key of keys) {
    const value = connection[key];
    if (value !== undefined && value !== null) {
      record[key] = value;
    }
  }
  return record;
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const connections = (await getCurrentProviderConnections()) as ConnectionRecord[];
    const entries = connections
      .filter(hasCredentialData)
      .map(toCredentialBackupRecord);

    return NextResponse.json({
      format: "universal-credentials",
      exportedAt: new Date().toISOString(),
      entries,
    });
  } catch (error) {
    console.log("Error exporting credentials:", error);
    return NextResponse.json(
      { error: "Failed to export credentials" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  exportCurrentDatabase,
  getCurrentSettingsAfterDatabaseImport,
  importCurrentDatabase,
} from "@/lib/databaseBackupAccess";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const payload = await exportCurrentDatabase();
    return NextResponse.json(payload);
  } catch (error) {
    console.log("Error exporting database:", error);
    return NextResponse.json({ error: "Failed to export database" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const payload: unknown = await request.json();
    await importCurrentDatabase(payload);

    // Ensure proxy settings take effect immediately after a DB import.
    try {
      const settings = await getCurrentSettingsAfterDatabaseImport();
      applyOutboundProxyEnv(settings);
    } catch (err) {
      console.warn("[Settings][DatabaseImport] Failed to re-apply outbound proxy env:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import database";

    console.log("Error importing database:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

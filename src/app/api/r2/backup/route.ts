import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { publishRuntimeArtifactsFromCurrentSettings } from "@/lib/r2BackupRuntime";

/**
 * POST /api/r2/backup - Trigger immediate SQLite backup to R2
 */
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const result = await publishRuntimeArtifactsFromCurrentSettings();
    const backupOk = result.backup?.ok === true;
    const runtimeOk = result.runtime?.ok === true;
    const sqliteOk = result.sqlite?.ok === true;
    const sqliteUploaded = result.sqlite?.uploaded === true;
    const sqliteSkipped = result.sqlite?.skipped === true;

    return NextResponse.json({
      success: backupOk && runtimeOk && sqliteOk,
      backupReady: backupOk && runtimeOk,
      sqliteUploaded,
      sqliteSkipped,
      backupOutcome: sqliteUploaded ? "uploaded" : (sqliteSkipped ? "unchanged" : "failed"),
      ...result
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

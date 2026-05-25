import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentLocalSettings } from "@/lib/r2BackupLocalDb";
import { readBackupArtifactFromCurrentSettings } from "@/lib/r2BackupRuntime";

type SettingsLike = {
  r2Config?: {
    endpoint?: string | null;
    bucket?: string | null;
    accessKeyId?: string | null;
    secretAccessKey?: string | null;
  } | null;
  r2RuntimePublicBaseUrl?: string | null;
  r2BackupEnabled?: boolean | null;
  r2LastRuntimePublishAt?: string | null;
  r2LastBackupAt?: string | null;
  r2LastRestoreAt?: string | null;
};

type BackupArtifactLike = {
  generatedAt?: string | null;
  machineId?: string | null;
  sqlite?: {
    url?: string | null;
    key?: string | null;
    size?: number | null;
  } | null;
} | null;

type DirectStatusInput = {
  runtimeConfigured: boolean;
  backupConfigured: boolean;
  settings: SettingsLike;
  artifactError?: string | null;
  backupArtifact?: BackupArtifactLike;
};

function buildDirectStatus({
  runtimeConfigured,
  backupConfigured,
  settings,
  artifactError = null,
  backupArtifact = null,
}: DirectStatusInput) {
  if (!runtimeConfigured && !backupConfigured) {
    return {
      state: "idle",
      summary: "Direct R2 not configured.",
    };
  }

  if (runtimeConfigured && !backupConfigured) {
    return {
      state: "runtime-only",
      summary:
        "Runtime publishing is configured, but private R2 backup access is not configured yet.",
    };
  }

  if (backupArtifact?.sqlite?.url || backupArtifact?.sqlite?.key) {
    return {
      state: "ready",
      summary: "Direct R2 configured and backup artifact available.",
    };
  }

  if (settings?.r2LastRuntimePublishAt) {
    return {
      state: "published",
      summary: artifactError
        ? "Direct R2 configured and runtime artifacts were published, but backup artifact is unavailable."
        : "Direct R2 configured and runtime artifacts were published.",
    };
  }

  if (artifactError) {
    return {
      state: "configured",
      summary: "Direct R2 configured, but backup artifact is unavailable.",
    };
  }

  return {
    state: "configured",
    summary: "Direct R2 configured.",
  };
}

function buildBackupArtifactSummary(backupArtifact: BackupArtifactLike) {
  if (!backupArtifact || typeof backupArtifact !== "object") return null;

  const sqlite = backupArtifact.sqlite && typeof backupArtifact.sqlite === "object"
    ? backupArtifact.sqlite
    : null;

  return {
    generatedAt: typeof backupArtifact.generatedAt === "string" ? backupArtifact.generatedAt : null,
    machineId: typeof backupArtifact.machineId === "string" ? backupArtifact.machineId : null,
    sqlite: sqlite
      ? {
          key: typeof sqlite.key === "string" ? sqlite.key : null,
          size: Number.isFinite(sqlite.size) ? sqlite.size : null,
        }
      : null,
  };
}

function hasPrivateR2Config(settings: SettingsLike = {}) {
  const config = settings.r2Config || {};
  return [config.endpoint, config.bucket, config.accessKeyId, config.secretAccessKey].every(
    (value) => String(value || "").trim() !== ""
  );
}

/**
 * GET /api/r2/info - Get direct R2 publish status for Settings page
 */
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const settings = (await getCurrentLocalSettings()) as SettingsLike;
    const backupConfigured = hasPrivateR2Config(settings);
    const runtimeConfigured =
      backupConfigured || String(settings.r2RuntimePublicBaseUrl || "").trim() !== "";
    const configured = runtimeConfigured || backupConfigured;

    if (!configured) {
      return NextResponse.json({
        configured: false,
        runtimeConfigured: false,
        backupConfigured: false,
        backupReady: false,
        restoreReady: false,
        r2BackupEnabled: settings.r2BackupEnabled || false,
        r2LastRuntimePublishAt: settings.r2LastRuntimePublishAt || null,
        r2LastBackupAt: settings.r2LastBackupAt || null,
        r2LastRestoreAt: settings.r2LastRestoreAt || null,
        backupArtifactUrl: null,
        backupArtifact: null,
        artifactError: null,
        status: buildDirectStatus({ runtimeConfigured: false, backupConfigured: false, settings }),
      });
    }

    let backupArtifactUrl: string | null = null;
    let backupArtifact: BackupArtifactLike = null;
    let artifactError: string | null = null;

    if (backupConfigured) {
      try {
        const backupArtifactResult = await readBackupArtifactFromCurrentSettings();
        backupArtifactUrl = backupArtifactResult.artifactUrl;
        backupArtifact = backupArtifactResult.artifact as BackupArtifactLike;
      } catch (error) {
        artifactError = error instanceof Error ? error.message : "Failed to read backup artifact";
      }
    }

    const backupReady = backupConfigured && !artifactError;
    const restoreReady =
      backupReady && Boolean(backupArtifact?.sqlite?.url || backupArtifact?.sqlite?.key);

    return NextResponse.json({
      configured: true,
      runtimeConfigured,
      backupConfigured,
      backupReady,
      restoreReady,
      r2BackupEnabled: settings.r2BackupEnabled || false,
      r2LastRuntimePublishAt: settings.r2LastRuntimePublishAt || null,
      r2LastBackupAt: settings.r2LastBackupAt || null,
      r2LastRestoreAt: settings.r2LastRestoreAt || null,
      backupArtifactUrl,
      backupArtifact: buildBackupArtifactSummary(backupArtifact),
      artifactError,
      status: buildDirectStatus({
        runtimeConfigured,
        backupConfigured,
        settings,
        artifactError,
        backupArtifact,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

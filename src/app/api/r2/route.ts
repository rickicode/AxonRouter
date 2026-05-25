import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { registerWithWorker } from "@/lib/cloudWorkerClient";
import {
  getCurrentLocalSettings,
  updateCurrentLocalSettings,
} from "@/lib/r2BackupLocalDb";

type BackupSchedule = "daily" | "weekly" | "monthly";

type R2ConfigInput = Partial<Record<(typeof R2_CONFIG_STRING_FIELDS)[number], unknown>>;

type ValidatedR2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  region: string;
  publicUrl: string;
  connected: false;
  lastCheckedAt: null;
  lastError: string;
};

type RouteError = Error & {
  status?: number;
};

type WorkerRegistrationFailure = {
  url: string;
  error: string;
};

type RouteSettings = {
  r2Config?: unknown;
  r2BackupEnabled?: boolean;
  r2SqliteBackupSchedule?: string;
  r2AutoPublishEnabled?: boolean;
  r2RuntimePublicBaseUrl?: unknown;
  r2RuntimeCacheTtlSeconds?: unknown;
  r2LastRuntimePublishAt?: unknown;
  r2LastBackupAt?: unknown;
  r2LastRestoreAt?: unknown;
  cloudUrls?: Array<{ url?: string | null } | null>;
  cloudSharedSecret?: unknown;
};

type RouteUpdates = Partial<{
  r2Config: ValidatedR2Config;
  r2BackupEnabled: boolean;
  r2SqliteBackupSchedule: BackupSchedule;
  r2AutoPublishEnabled: boolean;
  r2RuntimePublicBaseUrl: string;
  r2RuntimeCacheTtlSeconds: number;
}>;

const VALID_SCHEDULES: BackupSchedule[] = ["daily", "weekly", "monthly"];
const R2_CONFIG_STRING_FIELDS = [
  "accountId",
  "accessKeyId",
  "secretAccessKey",
  "bucket",
  "endpoint",
  "region",
  "publicUrl",
] as const;

function validateSchedule(schedule: unknown): schedule is BackupSchedule {
  return typeof schedule === "string" && VALID_SCHEDULES.includes(schedule as BackupSchedule);
}

function validateRuntimeCacheTtlSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 300;
}

function normalizeRuntimeCacheTtlSeconds(value: unknown): number {
  return validateRuntimeCacheTtlSeconds(value) ? value : 15;
}

function validateR2ConfigUpdate(
  config: unknown,
): { error: string } | { value: ValidatedR2Config } {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { error: "Invalid r2Config. Expected an object." };
  }

  const typedConfig = config as R2ConfigInput;

  for (const field of R2_CONFIG_STRING_FIELDS) {
    if (typedConfig[field] !== undefined && typeof typedConfig[field] !== "string") {
      return { error: `Invalid r2Config.${field}. Expected a string.` };
    }
  }

  return {
    value: {
      accountId: String(typedConfig.accountId || ""),
      accessKeyId: String(typedConfig.accessKeyId || ""),
      secretAccessKey: String(typedConfig.secretAccessKey || ""),
      bucket: String(typedConfig.bucket || ""),
      endpoint: String(typedConfig.endpoint || ""),
      region: String(typedConfig.region || ""),
      publicUrl: String(typedConfig.publicUrl || ""),
      connected: false,
      lastCheckedAt: null,
      lastError: "",
    },
  };
}

function shouldRefreshWorkerRegistration(updates: RouteUpdates): boolean {
  return (
    Object.prototype.hasOwnProperty.call(updates, "r2RuntimePublicBaseUrl") ||
    Object.prototype.hasOwnProperty.call(updates, "r2RuntimeCacheTtlSeconds")
  );
}

function buildWorkerRegistrationMetadata(settings: RouteSettings) {
  const runtimeUrl =
    typeof settings.r2RuntimePublicBaseUrl === "string"
      ? settings.r2RuntimePublicBaseUrl.trim()
      : "";
  const cacheTtlSeconds = normalizeRuntimeCacheTtlSeconds(settings.r2RuntimeCacheTtlSeconds);

  return {
    ...(runtimeUrl ? { runtimeUrl } : {}),
    ...(Number.isInteger(cacheTtlSeconds) ? { cacheTtlSeconds } : {}),
  };
}

async function refreshRegisteredWorkers(
  settings: RouteSettings,
): Promise<WorkerRegistrationFailure[]> {
  const workers = Array.isArray(settings.cloudUrls) ? settings.cloudUrls : [];
  const metadata = buildWorkerRegistrationMetadata(settings);
  const failures: WorkerRegistrationFailure[] = [];
  const secret = typeof settings.cloudSharedSecret === "string" ? settings.cloudSharedSecret : "";

  for (const worker of workers) {
    if (!worker?.url || !secret) continue;
    try {
      await registerWithWorker(worker.url, secret, metadata);
    } catch (error) {
      const typedError = error as { message?: string } | undefined;
      const failure = {
        url: worker.url,
        error: typedError?.message || "Worker registration failed",
      };
      failures.push(failure);
      console.warn(`[R2] Failed to register worker ${worker.url}:`, typedError?.message);
    }
  }

  return failures;
}

function buildResponsePayload(settings: RouteSettings) {
  return {
    r2Config: settings.r2Config,
    r2BackupEnabled: settings.r2BackupEnabled || false,
    r2SqliteBackupSchedule: settings.r2SqliteBackupSchedule || "daily",
    r2AutoPublishEnabled: settings.r2AutoPublishEnabled === true,
    r2RuntimePublicBaseUrl:
      typeof settings.r2RuntimePublicBaseUrl === "string" ? settings.r2RuntimePublicBaseUrl : "",
    r2RuntimeCacheTtlSeconds: normalizeRuntimeCacheTtlSeconds(settings.r2RuntimeCacheTtlSeconds),
    r2LastRuntimePublishAt: settings.r2LastRuntimePublishAt || null,
    r2LastBackupAt: settings.r2LastBackupAt || null,
    r2LastRestoreAt: settings.r2LastRestoreAt || null,
  };
}

/**
 * GET /api/r2 - Get R2 backup configuration
 */
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const settings = (await getCurrentLocalSettings()) as RouteSettings;
    return NextResponse.json(buildResponsePayload(settings));
  } catch (error) {
    const routeError = error as RouteError;
    return NextResponse.json({ error: routeError.message }, { status: routeError.status || 500 });
  }
}

/**
 * PATCH /api/r2 - Update R2 backup configuration
 */
export async function PATCH(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    await getCurrentLocalSettings();
    const updates: RouteUpdates = {};

    if (body.r2Config !== undefined) {
      const r2ConfigUpdate = validateR2ConfigUpdate(body.r2Config);
      if ("error" in r2ConfigUpdate) {
        return NextResponse.json({ error: r2ConfigUpdate.error }, { status: 400 });
      }

      updates.r2Config = r2ConfigUpdate.value;
    }

    if (typeof body.r2BackupEnabled === "boolean") {
      updates.r2BackupEnabled = body.r2BackupEnabled;
    }

    if (body.r2SqliteBackupSchedule !== undefined) {
      if (!validateSchedule(body.r2SqliteBackupSchedule)) {
        return NextResponse.json(
          { error: "Invalid R2 backup schedule. Expected one of: daily, weekly, monthly." },
          { status: 400 },
        );
      }

      updates.r2SqliteBackupSchedule = body.r2SqliteBackupSchedule;
    }

    if (body.r2AutoPublishEnabled !== undefined) {
      if (typeof body.r2AutoPublishEnabled !== "boolean") {
        return NextResponse.json(
          { error: "Invalid r2AutoPublishEnabled. Expected a boolean." },
          { status: 400 },
        );
      }

      updates.r2AutoPublishEnabled = body.r2AutoPublishEnabled;
    }

    if (body.r2RuntimePublicBaseUrl !== undefined) {
      if (typeof body.r2RuntimePublicBaseUrl !== "string") {
        return NextResponse.json(
          { error: "Invalid r2RuntimePublicBaseUrl. Expected a string." },
          { status: 400 },
        );
      }

      updates.r2RuntimePublicBaseUrl = body.r2RuntimePublicBaseUrl.trim();
    }

    if (body.r2RuntimeCacheTtlSeconds !== undefined) {
      if (!validateRuntimeCacheTtlSeconds(body.r2RuntimeCacheTtlSeconds)) {
        return NextResponse.json(
          { error: "Invalid r2RuntimeCacheTtlSeconds. Expected an integer between 1 and 300." },
          { status: 400 },
        );
      }

      updates.r2RuntimeCacheTtlSeconds = body.r2RuntimeCacheTtlSeconds;
    }

    const settings = (await updateCurrentLocalSettings(updates as Record<string, unknown>)) as RouteSettings;
    let workerRegistrationFailures: WorkerRegistrationFailure[] = [];

    if (shouldRefreshWorkerRegistration(updates)) {
      workerRegistrationFailures = await refreshRegisteredWorkers(settings);
    }

    const schedulerRelevantChange =
      Object.prototype.hasOwnProperty.call(updates, "r2BackupEnabled") ||
      Object.prototype.hasOwnProperty.call(updates, "r2SqliteBackupSchedule");

    if (schedulerRelevantChange) {
      try {
        const { startR2BackupScheduler, stopR2BackupScheduler, updateSqliteBackupSchedule } =
          await import("@/lib/r2BackupScheduler");

        if (settings.r2BackupEnabled === true) {
          await startR2BackupScheduler();
          if (updates.r2SqliteBackupSchedule) {
            await updateSqliteBackupSchedule();
          }
        } else {
          stopR2BackupScheduler();
        }
      } catch {
        /* scheduler may be unavailable during tests or startup */
      }
    }

    return NextResponse.json({
      success: true,
      ...buildResponsePayload(settings),
      ...(workerRegistrationFailures.length > 0 ? { workerRegistrationFailures } : {}),
    });
  } catch (error) {
    const routeError = error as RouteError;
    return NextResponse.json({ error: routeError.message }, { status: routeError.status || 500 });
  }
}

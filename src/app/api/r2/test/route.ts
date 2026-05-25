import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { testR2Connection } from "@/lib/r2BackupRuntime";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";

type R2Config = Record<string, unknown> & {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
  endpoint?: string;
  region?: string;
  connected?: boolean;
  lastCheckedAt?: string;
  lastError?: string;
};

const REQUIRED_R2_FIELDS: Array<keyof R2Config> = [
  "accountId",
  "accessKeyId",
  "secretAccessKey",
  "bucket",
  "endpoint",
  "region",
];

function getMissingFields(config: R2Config): string[] {
  return REQUIRED_R2_FIELDS.filter((field) => String(config?.[field] || "").trim() === "");
}

function buildValidationState(config: R2Config, overrides: Partial<R2Config>): R2Config {
  return {
    ...config,
    ...overrides,
  };
}

/**
 * POST /api/r2/test - Validate the configured global R2 connection and persist status.
 */
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const settings = await getCurrentSettings();
  const currentConfig = ((settings.r2Config || {}) as R2Config);
  const missingFields = getMissingFields(currentConfig);
  const checkedAt = new Date().toISOString();

  if (missingFields.length > 0) {
    const error = `Missing required R2 configuration fields: ${missingFields.join(", ")}`;
    await updateCurrentSettings({
      r2Config: buildValidationState(currentConfig, {
        connected: false,
        lastCheckedAt: checkedAt,
        lastError: error,
      }),
    });

    return NextResponse.json(
      {
        success: false,
        error,
      },
      { status: 400 }
    );
  }

  try {
    await testR2Connection(currentConfig);

    const nextConfig = buildValidationState(currentConfig, {
      connected: true,
      lastCheckedAt: checkedAt,
      lastError: "",
    });
    const updatedSettings = await updateCurrentSettings({ r2Config: nextConfig });

    return NextResponse.json({
      success: true,
      r2Config: updatedSettings.r2Config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const nextConfig = buildValidationState(currentConfig, {
      connected: false,
      lastCheckedAt: checkedAt,
      lastError: message,
    });
    await updateCurrentSettings({ r2Config: nextConfig });

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

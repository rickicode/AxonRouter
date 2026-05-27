import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { getSafeExecCwd } from "../_lib/safeExec";

const execAsync = promisify(exec);
const SAFE_EXEC_CWD = getSafeExecCwd();

type PiModelConfig = {
  id: string;
};

type PiProviderConfig = {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: PiModelConfig[];
};

type PiSettingsConfig = {
  providers?: Record<string, PiProviderConfig>;
};

type PiSettingsRequestBody = {
  baseUrl?: unknown;
  apiKey?: unknown;
  models?: unknown;
};

const getConfigDir = () => path.join(os.homedir(), ".pi", "agent");
const getConfigPath = () => path.join(getConfigDir(), "models.json");

// Check if pi CLI is installed
const checkPiInstalled = async (): Promise<boolean> => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where pi" : "which pi";
    await execAsync(command, { cwd: SAFE_EXEC_CWD, windowsHide: true });
    return true;
  } catch {
    // Also check if config file exists
    try {
      await fs.access(getConfigPath());
      return true;
    } catch {
      return false;
    }
  }
};

const readConfig = async (): Promise<PiSettingsConfig | null> => {
  try {
    const content = await fs.readFile(getConfigPath(), "utf-8");
    return JSON.parse(content) as PiSettingsConfig;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
};

const hasAxonRouterConfig = (config: PiSettingsConfig | null): boolean => {
  if (!config?.providers) return false;
  return !!config.providers["axonrouter"];
};

const normalizePiBaseUrl = (baseUrl: unknown): string => {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  if (trimmed.endsWith("/api/v1")) return `${trimmed.slice(0, -7)}/v1`;
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
};

// GET - Check pi CLI and read current settings
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const isInstalled = await checkPiInstalled();

    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        config: null,
        message: "Pi CLI is not installed",
      });
    }

    const config = await readConfig();
    const providerConfig = config?.providers?.["axonrouter"];
    const models = providerConfig?.models || [];

    return NextResponse.json({
      installed: true,
      config,
      hasAxonRouter: hasAxonRouterConfig(config),
      configPath: getConfigPath(),
      pi: {
        models: models.map((model) => model.id),
        baseURL: providerConfig?.baseUrl || null,
        apiKey: providerConfig?.apiKey || null,
      },
    });
  } catch (error) {
    console.log("Error checking pi settings:", error);
    return NextResponse.json({ error: "Failed to check pi settings" }, { status: 500 });
  }
}

// POST - Apply AxonRouter as custom provider in models.json
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { baseUrl, apiKey, models } = (await request.json()) as PiSettingsRequestBody;

    if (!baseUrl || !Array.isArray(models) || models.length === 0) {
      return NextResponse.json({ error: "baseUrl and models array are required" }, { status: 400 });
    }

    const configDir = getConfigDir();
    const configPath = getConfigPath();

    await fs.mkdir(configDir, { recursive: true });

    // Read existing config or start fresh
    let config: PiSettingsConfig = { providers: {} };
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(existing) as PiSettingsConfig;
      if (!config.providers) config.providers = {};
    } catch {
      // No existing config
    }

    // Backup original if this is first time
    const backupPath = `${configPath}.backup`;
    try {
      await fs.access(backupPath);
    } catch {
      if (config.providers && Object.keys(config.providers).length > 0) {
        await fs.writeFile(backupPath, JSON.stringify(config, null, 2));
      }
    }

    const normalizedBaseUrl = normalizePiBaseUrl(baseUrl);
    const keyToUse = typeof apiKey === "string" && apiKey ? apiKey : "sk_axonrouter";

    // Create axonrouter provider config
    config.providers["axonrouter"] = {
      baseUrl: normalizedBaseUrl,
      api: "openai-completions",
      apiKey: keyToUse,
      models: models.map((modelId) => ({ id: String(modelId) })),
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "Pi configuration updated successfully",
      configPath,
    });
  } catch (error) {
    console.log("Error applying pi settings:", error);
    return NextResponse.json({ error: "Failed to apply pi settings" }, { status: 500 });
  }
}

// DELETE - Restore original config
export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const configPath = getConfigPath();
    const backupPath = `${configPath}.backup`;

    try {
      await fs.access(backupPath);
      const backup = await fs.readFile(backupPath, "utf-8");
      await fs.writeFile(configPath, backup);
      await fs.unlink(backupPath);

      return NextResponse.json({
        success: true,
        message: "Original configuration restored",
      });
    } catch {
      return NextResponse.json({ error: "No backup found" }, { status: 404 });
    }
  } catch (error) {
    console.log("Error restoring pi settings:", error);
    return NextResponse.json({ error: "Failed to restore pi settings" }, { status: 500 });
  }
}

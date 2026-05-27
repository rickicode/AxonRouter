import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";

const PROVIDER = "gateway";

type JsonRecord = Record<string, unknown>;

type MetaEntry = {
  id: string;
  name: string;
};

type MetaConfig = {
  appliedId?: string;
  entries?: MetaEntry[];
};

type CoworkModelConfig = string | { name?: string };

type CoworkConfig = {
  inferenceProvider?: string;
  inferenceGatewayBaseUrl?: string;
  inferenceGatewayApiKey?: string;
  inferenceModels?: CoworkModelConfig[];
};

type DeploymentConfig = JsonRecord & {
  deploymentMode?: string;
};

const getErrorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;

const getCandidateRoots = (): string[] => {
  if (os.platform() === "darwin") {
    const base = path.join(os.homedir(), "Library", "Application Support");
    return [path.join(base, "Claude-3p"), path.join(base, "Claude")];
  }
  if (os.platform() === "win32") {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const roaming = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return [
      path.join(localApp, "Claude-3p"),
      path.join(roaming, "Claude-3p"),
      path.join(localApp, "Claude"),
      path.join(roaming, "Claude"),
    ];
  }
  return [
    path.join(os.homedir(), ".config", "Claude-3p"),
    path.join(os.homedir(), ".config", "Claude"),
  ];
};

const getAppInstallPaths = (): string[] => {
  if (os.platform() === "darwin") {
    return ["/Applications/Claude.app", path.join(os.homedir(), "Applications", "Claude.app")];
  }
  if (os.platform() === "win32") {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    return [
      path.join(localApp, "AnthropicClaude"),
      path.join(programFiles, "Claude"),
      path.join(programFiles, "AnthropicClaude"),
    ];
  }
  return [];
};

const resolveAppRootForRead = async (): Promise<string> => {
  const candidates = getCandidateRoots();
  for (const dir of candidates) {
    try {
      await fs.access(path.join(dir, "configLibrary"));
      return dir;
    } catch {}
  }
  return candidates[0];
};

const getWriteRoot = (): string => getCandidateRoots()[0];
const getConfigDir = async (): Promise<string> => path.join(await resolveAppRootForRead(), "configLibrary");
const getWriteConfigDir = (): string => path.join(getWriteRoot(), "configLibrary");
const getMetaPath = async (): Promise<string> => path.join(await getConfigDir(), "_meta.json");
const getWriteMetaPath = (): string => path.join(getWriteConfigDir(), "_meta.json");

const get1pRoot = (): string => {
  if (os.platform() === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude");
  }
  if (os.platform() === "win32") {
    const roaming = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(roaming, "Claude");
  }
  return path.join(os.homedir(), ".config", "Claude");
};

const bootstrapDeploymentMode = async (): Promise<boolean> => {
  const cfgPath = path.join(get1pRoot(), "claude_desktop_config.json");
  let cfg: DeploymentConfig = {};
  try {
    const content = await fs.readFile(cfgPath, "utf-8");
    cfg = JSON.parse(content) as DeploymentConfig;
  } catch (error) {
    if (getErrorCode(error) !== "ENOENT") throw error;
  }
  if (cfg.deploymentMode === "3p") return false;
  cfg.deploymentMode = "3p";
  await fs.mkdir(get1pRoot(), { recursive: true });
  await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2));
  return true;
};

const checkInstalled = async (): Promise<boolean> => {
  for (const dir of [...getCandidateRoots(), ...getAppInstallPaths()]) {
    try {
      await fs.access(dir);
      return true;
    } catch {}
  }
  return false;
};

const isLocalhostUrl = (url: unknown): boolean => /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(String(url || ""));

const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") return null;
    throw error;
  }
};

const ensureMeta = async (): Promise<MetaConfig> => {
  const writeMetaPath = getWriteMetaPath();
  let meta = await readJson<MetaConfig>(writeMetaPath);
  if (!meta || !meta.appliedId) {
    const existingRead = await readJson<MetaConfig>(await getMetaPath());
    if (existingRead?.appliedId) {
      meta = existingRead;
    } else {
      const newId = crypto.randomUUID();
      meta = { appliedId: newId, entries: [{ id: newId, name: "Default" }] };
    }
    await fs.mkdir(getWriteConfigDir(), { recursive: true });
    await fs.writeFile(writeMetaPath, JSON.stringify(meta, null, 2));
  }
  return meta;
};

type PostBody = {
  baseUrl?: string;
  apiKey?: string;
  models?: unknown;
};

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const installed = await checkInstalled();
    if (!installed) {
      return NextResponse.json({
        installed: false,
        config: null,
        message: "Claude Desktop (Cowork mode) not detected",
      });
    }

    const meta = await readJson<MetaConfig>(await getMetaPath());
    const appliedId = meta?.appliedId || null;
    const configDir = await getConfigDir();
    const configPath = appliedId ? path.join(configDir, `${appliedId}.json`) : null;
    const config = configPath ? await readJson<CoworkConfig>(configPath) : null;

    const baseUrl = config?.inferenceGatewayBaseUrl || null;
    const models = Array.isArray(config?.inferenceModels)
      ? config.inferenceModels
          .map((model) => (typeof model === "string" ? model : model?.name))
          .filter(Boolean)
      : [];

    const hasAxonRouter = !!(config?.inferenceProvider === PROVIDER && baseUrl);

    return NextResponse.json({
      installed: true,
      config,
      hasAxonRouter,
      configPath,
      cowork: {
        appliedId,
        baseUrl,
        models,
        provider: config?.inferenceProvider || null,
      },
    });
  } catch (error) {
    console.log("Error reading cowork settings:", error);
    return NextResponse.json({ error: "Failed to read cowork settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { baseUrl, apiKey, models } = (await request.json()) as PostBody;

    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: "baseUrl and apiKey are required" }, { status: 400 });
    }

    if (isLocalhostUrl(baseUrl)) {
      return NextResponse.json(
        {
          error: "Claude Cowork sandbox cannot reach localhost. Enable Tunnel/Cloud Endpoint or use Tailscale/VPS.",
        },
        { status: 400 }
      );
    }

    const modelsArray = Array.isArray(models)
      ? models.filter((model): model is string => typeof model === "string" && model.trim().length > 0)
      : [];
    if (modelsArray.length === 0) {
      return NextResponse.json({ error: "At least one model is required" }, { status: 400 });
    }

    const bootstrapped = await bootstrapDeploymentMode();
    const meta = await ensureMeta();
    const configPath = path.join(getWriteConfigDir(), `${meta.appliedId}.json`);

    const newConfig: CoworkConfig = {
      inferenceProvider: PROVIDER,
      inferenceGatewayBaseUrl: baseUrl,
      inferenceGatewayApiKey: apiKey,
      inferenceModels: modelsArray.map((name) => ({ name })),
    };

    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

    return NextResponse.json({
      success: true,
      bootstrapped,
      message: bootstrapped
        ? "Cowork enabled (3p mode set). Quit & reopen Claude Desktop."
        : "Cowork settings applied. Quit & reopen Claude Desktop.",
      configPath,
    });
  } catch (error) {
    console.log("Error applying cowork settings:", error);
    return NextResponse.json({ error: "Failed to apply cowork settings" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const meta = await readJson<MetaConfig>(await getMetaPath());
    if (!meta?.appliedId) {
      return NextResponse.json({ success: true, message: "No active config to reset" });
    }
    const configPath = path.join(await getConfigDir(), `${meta.appliedId}.json`);
    try {
      await fs.writeFile(configPath, JSON.stringify({}, null, 2));
    } catch (error) {
      if (getErrorCode(error) !== "ENOENT") throw error;
    }
    return NextResponse.json({ success: true, message: "Cowork config reset" });
  } catch (error) {
    console.log("Error resetting cowork settings:", error);
    return NextResponse.json({ error: "Failed to reset cowork settings" }, { status: 500 });
  }
}

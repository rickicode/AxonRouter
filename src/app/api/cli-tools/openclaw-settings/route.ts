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

type JsonObject = Record<string, unknown>;

type OpenClawAgent = {
  id?: string;
  agentDir?: string;
  model?: string;
  [key: string]: unknown;
};

type OpenClawSettings = JsonObject & {
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
        [key: string]: unknown;
      };
      models?: Record<string, JsonObject>;
      [key: string]: unknown;
    };
    list?: OpenClawAgent[];
    [key: string]: unknown;
  };
  models?: {
    providers?: Record<string, JsonObject>;
    [key: string]: unknown;
  };
};

type AgentModelsPayload = Record<string, string>;

type OpenClawPostBody = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  agentModels?: AgentModelsPayload;
};

type AgentModelsFile = {
  providers?: Record<string, JsonObject>;
  [key: string]: unknown;
};

const getOpenClawDir = (): string => path.join(os.homedir(), ".openclaw");
const getOpenClawSettingsPath = (): string => path.join(getOpenClawDir(), "openclaw.json");

// Check if openclaw CLI is installed (via which/where or config file exists)
const checkOpenClawInstalled = async (): Promise<boolean> => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where openclaw" : "which openclaw";
    // On Windows, inject %APPDATA%\npm into PATH so npm global packages are found
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { cwd: SAFE_EXEC_CWD, windowsHide: true, env });
    return true;
  } catch {
    try {
      await fs.access(getOpenClawSettingsPath());
      return true;
    } catch {
      return false;
    }
  }
};

// Read current settings.json
const readSettings = async (): Promise<OpenClawSettings | null> => {
  try {
    const settingsPath = getOpenClawSettingsPath();
    const content = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(content) as OpenClawSettings;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

// Check if settings has AxonRouter config
const hasAxonRouterConfig = (settings: OpenClawSettings | null): boolean => {
  if (!settings?.models?.providers) return false;
  return !!settings.models.providers["axonrouter"];
};

// Read per-agent models.json and return current model id (without "axonrouter/" prefix)
const readAgentModel = async (agentDir: string): Promise<string | null> => {
  try {
    const modelsPath = path.join(agentDir, "models.json");
    const content = await fs.readFile(modelsPath, "utf-8");
    const data = JSON.parse(content) as {
      providers?: {
        [key: string]: {
          models?: Array<{ id?: string | null }>;
        };
      };
    };
    const models = data?.providers?.["axonrouter"]?.models;
    return models?.[0]?.id || null;
  } catch {
    return null;
  }
};

// GET - Check openclaw CLI and read current settings
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const isInstalled = await checkOpenClawInstalled();

    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        settings: null,
        message: "Open Claw CLI is not installed",
      });
    }

    const settings = await readSettings();

    // Enrich agents list with current per-agent model from models.json
    const agentList = settings?.agents?.list || [];
    const enrichedAgents = await Promise.all(
      agentList.map(async (agent) => {
        const agentModel = agent.agentDir ? await readAgentModel(agent.agentDir) : null;
        return { ...agent, currentModel: agentModel };
      })
    );

    return NextResponse.json({
      installed: true,
      settings,
      agents: enrichedAgents,
      hasAxonRouter: hasAxonRouterConfig(settings),
      settingsPath: getOpenClawSettingsPath(),
    });
  } catch (error) {
    console.log("Error checking openclaw settings:", error);
    return NextResponse.json({ error: "Failed to check openclaw settings" }, { status: 500 });
  }
}

// Write per-agent models.json
const writeAgentModels = async (
  agentDir: string,
  model: string,
  baseUrl: string,
  apiKey?: string
): Promise<void> => {
  await fs.mkdir(agentDir, { recursive: true });
  const modelsPath = path.join(agentDir, "models.json");
  let existing: AgentModelsFile = {};
  try {
    const content = await fs.readFile(modelsPath, "utf-8");
    existing = JSON.parse(content) as AgentModelsFile;
  } catch {
    // No existing
  }

  if (!existing.providers) existing.providers = {};
  existing.providers["axonrouter"] = {
    baseUrl,
    apiKey: apiKey || "your_api_key",
    api: "openai-completions",
    models: [{ id: model, name: model.split("/").pop() || model }],
  };
  await fs.writeFile(modelsPath, JSON.stringify(existing, null, 2));
};

// POST - Update AxonRouter settings (merge with existing settings)
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    // agentModels: { [agentId]: modelId } for per-agent override
    const { baseUrl, apiKey, model, agentModels = {} } = (await request.json()) as OpenClawPostBody;

    if (!baseUrl || !model) {
      return NextResponse.json({ error: "baseUrl and model are required" }, { status: 400 });
    }

    const openclawDir = getOpenClawDir();
    const settingsPath = getOpenClawSettingsPath();

    await fs.mkdir(openclawDir, { recursive: true });

    let settings: OpenClawSettings = {};
    try {
      const existingSettings = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(existingSettings) as OpenClawSettings;
    } catch {
      // No existing settings
    }

    if (!settings.agents) settings.agents = {};
    if (!settings.agents.defaults) settings.agents.defaults = {};
    if (!settings.agents.defaults.model) settings.agents.defaults.model = {};
    if (!settings.agents.defaults.models) settings.agents.defaults.models = {};
    if (!settings.models) settings.models = {};
    if (!settings.models.providers) settings.models.providers = {};

    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    const fullModelId = `axonrouter/${model}`;

    // Remove all old axonrouter/* entries from agents.defaults.models
    Object.keys(settings.agents.defaults.models)
      .filter((k) => k.startsWith("axonrouter/"))
      .forEach((k) => {
        delete settings.agents?.defaults?.models?.[k];
      });

    // Update default model
    settings.agents.defaults.model.primary = fullModelId;

    // Collect all unique models (default + per-agent)
    const allModelIds = new Set<string>([model]);
    Object.values(agentModels).forEach((m) => {
      if (m) allModelIds.add(m);
    });

    // Add fresh axonrouter models to allowlist
    allModelIds.forEach((m) => {
      settings.agents?.defaults?.models && (settings.agents.defaults.models[`axonrouter/${m}`] = {});
    });

    // Remove old axonrouter model from each agent in agents.list
    if (settings.agents.list) {
      settings.agents.list = settings.agents.list.map((agent) => {
        if (agent.model?.startsWith("axonrouter/")) {
          const { model: _model, ...rest } = agent;
          return rest;
        }
        return agent;
      });
    }

    // Update models.providers.axonrouter with all models
    settings.models.providers["axonrouter"] = {
      baseUrl: normalizedBaseUrl,
      apiKey: apiKey || "your_api_key",
      api: "openai-completions",
      models: [...allModelIds].map((m) => ({ id: m, name: m.split("/").pop() || m })),
    };

    // Set per-agent model in agents.list and write models.json
    if (settings.agents.list) {
      settings.agents.list = settings.agents.list.map((agent) => {
        const agentModel = agent.id ? agentModels[agent.id] : undefined;
        if (agentModel) return { ...agent, model: `axonrouter/${agentModel}` };
        return agent;
      });

      // Write per-agent models.json for agents with agentDir
      await Promise.all(
        settings.agents.list.map(async (agent) => {
          if (!agent.agentDir) return;
          const agentModel = agent.id ? agentModels[agent.id] : undefined;
          const modelToWrite = agentModel || model; // fallback to default
          await writeAgentModels(agent.agentDir, modelToWrite, normalizedBaseUrl, apiKey);
        })
      );
    }

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    return NextResponse.json({
      success: true,
      message: "Open Claw settings applied successfully!",
      settingsPath,
    });
  } catch (error) {
    console.log("Error updating openclaw settings:", error);
    return NextResponse.json({ error: "Failed to update openclaw settings" }, { status: 500 });
  }
}

// DELETE - Remove AxonRouter settings only (keep other settings)
export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const settingsPath = getOpenClawSettingsPath();

    // Read existing settings
    let settings: OpenClawSettings = {};
    try {
      const existingSettings = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(existingSettings) as OpenClawSettings;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No settings file to reset",
        });
      }
      throw error;
    }

    // Remove AxonRouter from models.providers
    if (settings.models?.providers) {
      delete settings.models.providers["axonrouter"];

      // Remove providers object if empty
      if (Object.keys(settings.models.providers).length === 0) {
        delete settings.models.providers;
      }
    }

    // Remove axonrouter models from agents.defaults.models allowlist
    if (settings.agents?.defaults?.models) {
      const keysToRemove = Object.keys(settings.agents.defaults.models).filter((k) => k.startsWith("axonrouter/"));
      for (const key of keysToRemove) {
        delete settings.agents.defaults.models[key];
      }
      if (Object.keys(settings.agents.defaults.models).length === 0) {
        delete settings.agents.defaults.models;
      }
    }

    // Reset agents.defaults.model.primary if it uses axonrouter
    if (settings.agents?.defaults?.model?.primary?.startsWith("axonrouter/")) {
      delete settings.agents.defaults.model.primary;
    }

    // Write updated settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    return NextResponse.json({
      success: true,
      message: "AxonRouter settings removed successfully",
    });
  } catch (error) {
    console.log("Error resetting openclaw settings:", error);
    return NextResponse.json({ error: "Failed to reset openclaw settings" }, { status: 500 });
  }
}

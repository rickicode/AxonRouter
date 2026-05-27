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

type JsonRecord = Record<string, unknown>;

type OpenCodeModelEntry = {
  name: string;
};

type OpenCodeProviderEntry = {
  npm?: string;
  options?: {
    baseURL?: string;
    apiKey?: string;
    [key: string]: unknown;
  };
  models?: Record<string, OpenCodeModelEntry>;
  [key: string]: unknown;
};

type OpenCodeConfig = {
  provider?: Record<string, OpenCodeProviderEntry>;
  model?: string;
  agent?: {
    explorer?: {
      description: string;
      mode: string;
      model: string;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type OpenCodePostBody = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  models?: string[];
  activeModel?: string;
  subagentModel?: string;
};

type OpenCodePatchBody = {
  clearActiveModel?: boolean;
};

const getConfigDir = () => path.join(os.homedir(), ".config", "opencode");
const getConfigPath = () => path.join(getConfigDir(), "opencode.json");

// Check if opencode CLI is installed (via which/where or config file exists)
const checkOpenCodeInstalled = async (): Promise<boolean> => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where opencode" : "which opencode";
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { cwd: SAFE_EXEC_CWD, windowsHide: true, env });
    return true;
  } catch {
    try {
      await fs.access(getConfigPath());
      return true;
    } catch {
      return false;
    }
  }
};

const readConfig = async (): Promise<OpenCodeConfig | null> => {
  try {
    const content = await fs.readFile(getConfigPath(), "utf-8");
    return JSON.parse(content) as OpenCodeConfig;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
};

const hasAxonRouterConfig = (config: OpenCodeConfig | null): boolean => {
  if (!config?.provider) return false;
  return !!config.provider["axonrouter"];
};

// GET - Check opencode CLI and read current settings
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const isInstalled = await checkOpenCodeInstalled();

    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        config: null,
        message: "OpenCode CLI is not installed",
      });
    }

    const config = await readConfig();
    const providerConfig = config?.provider?.["axonrouter"];
    const modelMap = providerConfig?.models || {};

    return NextResponse.json({
      installed: true,
      config,
      hasAxonRouter: hasAxonRouterConfig(config),
      configPath: getConfigPath(),
      opencode: {
        models: Object.keys(modelMap),
        activeModel: config?.model?.startsWith("axonrouter/") ? config.model.replace(/^axonrouter\//, "") : null,
        baseURL: providerConfig?.options?.baseURL || null,
      },
    });
  } catch (error: unknown) {
    console.log("Error checking opencode settings:", error);
    return NextResponse.json({ error: "Failed to check opencode settings" }, { status: 500 });
  }
}

// POST - Apply AxonRouter as openai-compatible provider (multi-model support)
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { baseUrl, apiKey, model, models, activeModel, subagentModel } =
      (await request.json()) as OpenCodePostBody;

    // Accept either `model` (string, legacy) or `models` (array of strings)
    const modelsArray = Array.isArray(models) ? models.slice() : typeof model === "string" ? [model] : [];

    if (!baseUrl || modelsArray.length === 0) {
      return NextResponse.json({ error: "baseUrl and at least one model are required" }, { status: 400 });
    }

    const configDir = getConfigDir();
    const configPath = getConfigPath();

    await fs.mkdir(configDir, { recursive: true });

    // Read existing config or start fresh
    let config: OpenCodeConfig = {};
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(existing) as OpenCodeConfig;
    } catch {
      // No existing config
    }

    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    const keyToUse = apiKey || "sk_axonrouter";
    const effectiveSubagentModel = subagentModel || modelsArray[0];

    // Ensure provider object
    if (!config.provider) config.provider = {};

    // Preserve any existing axonrouter provider entry and its models
    const existingProvider: OpenCodeProviderEntry = config.provider["axonrouter"] || {
      npm: "@ai-sdk/openai-compatible",
      options: {},
      models: {},
    };

    // Merge options (overwrite baseURL/apiKey)
    existingProvider.options = {
      ...existingProvider.options,
      baseURL: normalizedBaseUrl,
      apiKey: keyToUse,
    };

    // Ensure models map exists
    existingProvider.models = existingProvider.models || {};

    // Add or update entries for all requested models
    for (const m of modelsArray) {
      if (!m || typeof m !== "string") continue;
      existingProvider.models[m] = { name: m };
    }

    // Save merged provider back
    config.provider["axonrouter"] = existingProvider;

    // Set the active model: prefer explicit activeModel, else first of modelsArray
    // If activeModel is explicitly empty string, clear the model
    if (activeModel === "") {
      config.model = "";
    } else {
      const finalActive = activeModel || modelsArray[0];
      if (finalActive) {
        config.model = `axonrouter/${finalActive}`;
      }
    }

    // Add subagent configuration
    if (!config.agent) config.agent = {};
    config.agent.explorer = {
      description: "Fast explorer subagent for codebase exploration",
      mode: "subagent",
      model: `axonrouter/${effectiveSubagentModel}`,
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "OpenCode settings applied successfully!",
      configPath,
    });
  } catch (error: unknown) {
    console.log("Error applying opencode settings:", error);
    return NextResponse.json({ error: "Failed to apply settings" }, { status: 500 });
  }
}

// PATCH - Update specific settings (e.g., clear active model)
export async function PATCH(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { clearActiveModel } = (await request.json()) as OpenCodePatchBody;
    const configPath = getConfigPath();

    let config: OpenCodeConfig = {};
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(existing) as OpenCodeConfig;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No config file found" });
      }
      throw error;
    }

    if (clearActiveModel === true) {
      // Clear active model but keep models in the list
      if (config.model?.startsWith("axonrouter/")) {
        config.model = "";
      }
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "Settings updated",
    });
  } catch (error: unknown) {
    console.log("Error patching opencode settings:", error);
    return NextResponse.json({ error: "Failed to patch settings" }, { status: 500 });
  }
}

// DELETE - Remove AxonRouter provider or specific models from config
export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const modelToRemove = searchParams.get("model");
    const configPath = getConfigPath();

    let config: OpenCodeConfig = {};
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(existing) as OpenCodeConfig;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No config file to reset" });
      }
      throw error;
    }

    // If specific model provided, remove just that model
    if (modelToRemove && config.provider?.["axonrouter"]?.models) {
      delete config.provider["axonrouter"].models?.[modelToRemove];

      // If no models left, remove the provider
      if (Object.keys(config.provider["axonrouter"].models || {}).length === 0) {
        delete config.provider["axonrouter"];
        if (config.model?.startsWith("axonrouter/")) delete config.model;
      } else if (config.model === `axonrouter/${modelToRemove}`) {
        // If removed model was active, switch to first remaining model
        const remainingModels = Object.keys(config.provider["axonrouter"].models || {});
        config.model = `axonrouter/${remainingModels[0]}`;
      }
    } else {
      // No specific model - remove entire axonrouter provider
      if (config.provider) delete config.provider["axonrouter"];
      if (config.model?.startsWith("axonrouter/")) delete config.model;
    }

    // Remove subagent configuration
    if (config.agent?.explorer?.model?.startsWith("axonrouter/")) {
      delete config.agent.explorer;
      // Clean up empty agent object
      if (config.agent && Object.keys(config.agent).length === 0) delete config.agent;
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: modelToRemove ? `Model "${modelToRemove}" removed` : "AxonRouter settings removed from OpenCode",
    });
  } catch (error: unknown) {
    console.log("Error resetting opencode settings:", error);
    return NextResponse.json({ error: "Failed to reset opencode settings" }, { status: 500 });
  }
}

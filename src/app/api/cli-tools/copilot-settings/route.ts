import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import fs from "fs/promises";
import path from "path";
import os from "os";

type CopilotModelEntry = {
  id: string;
  name: string;
  url: string;
  toolCalling: boolean;
  vision: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
};

type CopilotProviderEntry = {
  name: string;
  vendor: string;
  apiKey: string;
  models: CopilotModelEntry[];
};

type CopilotConfig = CopilotProviderEntry[];

type CopilotSettingsRequest = {
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
};

type NodeError = Error & {
  code?: string;
};

// Resolve chatLanguageModels.json path per OS
const getConfigPath = (): string => {
  const home = os.homedir();
  const platform = os.platform();
  if (platform === "win32") {
    return path.join(process.env.APPDATA || home, "Code", "User", "chatLanguageModels.json");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Code", "User", "chatLanguageModels.json");
  }
  return path.join(home, ".config", "Code", "User", "chatLanguageModels.json");
};

const readConfig = async (): Promise<CopilotConfig | null> => {
  try {
    const content = await fs.readFile(getConfigPath(), "utf-8");
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as CopilotConfig) : null;
  } catch (error) {
    if ((error as NodeError).code === "ENOENT") return null;
    throw error;
  }
};

const hasAxonRouterConfig = (config: CopilotConfig | null): boolean => {
  if (!Array.isArray(config)) return false;
  return config.some((entry) => entry.name === "AxonRouter");
};

const getAxonRouterEntry = (config: CopilotConfig | null): CopilotProviderEntry | null => {
  if (!Array.isArray(config)) return null;
  return config.find((entry) => entry.name === "AxonRouter") || null;
};

// GET - Read current copilot config
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const config = await readConfig();
    const entry = getAxonRouterEntry(config);

    return NextResponse.json({
      installed: true,
      config,
      hasAxonRouter: hasAxonRouterConfig(config),
      configPath: getConfigPath(),
      currentModel: entry?.models?.[0]?.id || null,
      currentUrl: entry?.models?.[0]?.url || null,
    });
  } catch (error) {
    console.log("Error checking copilot settings:", error);
    return NextResponse.json({ error: "Failed to check copilot settings" }, { status: 500 });
  }
}

// POST - Apply AxonRouter config to chatLanguageModels.json
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { baseUrl, apiKey, models } = (await request.json()) as CopilotSettingsRequest;

    if (!baseUrl || !models?.length) {
      return NextResponse.json({ error: "baseUrl and models are required" }, { status: 400 });
    }

    const configPath = getConfigPath();
    await fs.mkdir(path.dirname(configPath), { recursive: true });

    // Read existing config array
    let config: CopilotConfig = [];
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      const parsed: unknown = JSON.parse(existing);
      config = Array.isArray(parsed) ? (parsed as CopilotConfig) : [];
    } catch {
      // No existing config
    }

    const endpointUrl = `${baseUrl}/chat/completions#models.ai.azure.com`;
    const keyToUse = apiKey || "sk_axonrouter";

    const newEntry: CopilotProviderEntry = {
      name: "AxonRouter",
      vendor: "azure",
      apiKey: keyToUse,
      models: models.map((id) => ({
        id,
        name: id,
        url: endpointUrl,
        toolCalling: true,
        vision: false,
        maxInputTokens: 128000,
        maxOutputTokens: 16000,
      })),
    };

    // Replace existing AxonRouter entry or append
    const idx = config.findIndex((e) => e.name === "AxonRouter");
    if (idx >= 0) {
      config[idx] = newEntry;
    } else {
      config.push(newEntry);
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "Copilot settings applied! Reload VS Code to take effect.",
      configPath,
    });
  } catch (error) {
    console.log("Error updating copilot settings:", error);
    return NextResponse.json({ error: "Failed to update copilot settings" }, { status: 500 });
  }
}

// DELETE - Remove AxonRouter entry from chatLanguageModels.json
export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const configPath = getConfigPath();

    let config: CopilotConfig = [];
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      const parsed: unknown = JSON.parse(existing);
      config = Array.isArray(parsed) ? (parsed as CopilotConfig) : [];
    } catch (error) {
      if ((error as NodeError).code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No config file to reset" });
      }
      throw error;
    }

    config = config.filter((e) => e.name !== "AxonRouter");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "AxonRouter removed from Copilot config",
    });
  } catch (error) {
    console.log("Error resetting copilot settings:", error);
    return NextResponse.json({ error: "Failed to reset copilot settings" }, { status: 500 });
  }
}

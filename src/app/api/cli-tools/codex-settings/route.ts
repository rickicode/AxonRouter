"use server";

import { exec } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { parseTOML, stringifyTOML } from "confbox";
import { promisify } from "util";
import { getSafeExecCwd } from "../_lib/safeExec";

const execAsync = promisify(exec);
const SAFE_EXEC_CWD = getSafeExecCwd();

type WritableTomlValue = any;
type WritableTomlObject = Record<string, any>;
type AuthData = Record<string, unknown> & {
  OPENAI_API_KEY?: string;
};

type CodexSettingsRequestBody = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  subagentModel?: string;
};

const getCodexDir = (): string => path.join(os.homedir(), ".codex");
const getCodexConfigPath = (): string => path.join(getCodexDir(), "config.toml");
const getCodexAuthPath = (): string => path.join(getCodexDir(), "auth.json");

// Flatten confbox-parsed TOML into a writable object, preserving nested tables
const parsedToWritable = (obj: unknown): WritableTomlObject => {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    return obj as WritableTomlObject;
  }
  return {};
};

// Set a nested key from a flat dotted path, creating intermediate objects as needed
const setNestedSection = (obj: WritableTomlObject, dottedKey: string, value: WritableTomlValue): void => {
  const keys = dottedKey.split(".");
  let cur: WritableTomlObject = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = cur[keys[i]];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]] as WritableTomlObject;
  }
  cur[keys[keys.length - 1]] = value;
};

// Delete a nested key from a flat dotted path
const deleteNestedSection = (obj: WritableTomlObject, dottedKey: string): void => {
  const keys = dottedKey.split(".");
  let cur: WritableTomlObject | undefined = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = cur?.[keys[i]];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      return;
    }
    cur = next as WritableTomlObject;
  }

  if (cur) {
    delete cur[keys[keys.length - 1]];
  }
};

// Check if codex CLI is installed (via which/where or config file exists)
const checkCodexInstalled = async (): Promise<boolean> => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where codex" : "which codex";
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { cwd: SAFE_EXEC_CWD, windowsHide: true, env });
    return true;
  } catch {
    try {
      await fs.access(getCodexConfigPath());
      return true;
    } catch {
      return false;
    }
  }
};

// Read current config.toml
const readConfig = async (): Promise<string | null> => {
  try {
    const configPath = getCodexConfigPath();
    const content = await fs.readFile(configPath, "utf-8");
    return content;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

// Check if config has AxonRouter settings
const hasAxonRouterConfig = (config: string | null): boolean => {
  if (!config) return false;
  return config.includes('model_provider = "axonrouter"') || config.includes("[model_providers.axonrouter]");
};

// GET - Check codex CLI and read current settings
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const isInstalled = await checkCodexInstalled();

    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        config: null,
        message: "Codex CLI is not installed",
      });
    }

    const config = await readConfig();

    return NextResponse.json({
      installed: true,
      config,
      hasAxonRouter: hasAxonRouterConfig(config),
      configPath: getCodexConfigPath(),
    });
  } catch (error: unknown) {
    console.log("Error checking codex settings:", error);
    return NextResponse.json({ error: "Failed to check codex settings" }, { status: 500 });
  }
}

// POST - Update AxonRouter settings (merge with existing config)
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { baseUrl, apiKey, model, subagentModel } = (await request.json()) as CodexSettingsRequestBody;

    if (!baseUrl || !apiKey || !model) {
      return NextResponse.json({ error: "baseUrl, apiKey and model are required" }, { status: 400 });
    }

    const codexDir = getCodexDir();
    const configPath = getCodexConfigPath();

    // Ensure directory exists
    await fs.mkdir(codexDir, { recursive: true });

    // Read and parse existing config
    let parsed: WritableTomlObject = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch {}

    // Update only AxonRouter related fields (api_key goes to auth.json, not config.toml)
    parsed.model = model;
    parsed.model_provider = "axonrouter";

    // Update or create axonrouter provider section (no api_key - Codex reads from auth.json)
    // Ensure /v1 suffix is added only once
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    setNestedSection(parsed, "model_providers.axonrouter", {
      name: "AxonRouter",
      base_url: normalizedBaseUrl,
      wire_api: "responses",
    });

    // Add subagent configuration
    const effectiveSubagentModel = subagentModel || model;
    setNestedSection(parsed, "agents.subagent", {
      model: effectiveSubagentModel,
    });

    // Write merged config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // Update auth.json with OPENAI_API_KEY (Codex reads this first)
    const authPath = getCodexAuthPath();
    let authData: AuthData = {};
    try {
      const existingAuth = await fs.readFile(authPath, "utf-8");
      authData = JSON.parse(existingAuth) as AuthData;
    } catch {}

    authData.OPENAI_API_KEY = apiKey;
    await fs.writeFile(authPath, JSON.stringify(authData, null, 2));

    return NextResponse.json({
      success: true,
      message: "Codex settings applied successfully!",
      configPath,
    });
  } catch (error: unknown) {
    console.log("Error updating codex settings:", error);
    return NextResponse.json({ error: "Failed to update codex settings" }, { status: 500 });
  }
}

// DELETE - Remove AxonRouter settings only (keep other settings)
export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const configPath = getCodexConfigPath();

    // Read and parse existing config
    let parsed: WritableTomlObject = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No config file to reset",
        });
      }
      throw error;
    }

    // Remove AxonRouter related root fields only if they point to axonrouter
    if (parsed.model_provider === "axonrouter") {
      delete parsed.model;
      delete parsed.model_provider;
    }

    // Remove axonrouter provider section
    deleteNestedSection(parsed, "model_providers.axonrouter");

    // Remove subagent configuration
    deleteNestedSection(parsed, "agents.subagent");

    // Write updated config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // Remove OPENAI_API_KEY from auth.json
    const authPath = getCodexAuthPath();
    try {
      const existingAuth = await fs.readFile(authPath, "utf-8");
      const authData = JSON.parse(existingAuth) as AuthData;
      delete authData.OPENAI_API_KEY;

      // Write back or delete if empty
      if (Object.keys(authData).length === 0) {
        await fs.unlink(authPath);
      } else {
        await fs.writeFile(authPath, JSON.stringify(authData, null, 2));
      }
    } catch {}

    return NextResponse.json({
      success: true,
      message: "AxonRouter settings removed successfully",
    });
  } catch (error: unknown) {
    console.log("Error resetting codex settings:", error);
    return NextResponse.json({ error: "Failed to reset codex settings" }, { status: 500 });
  }
}

"use server";

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

type DroidCustomModel = {
  model: string;
  id: string;
  index: number;
  baseUrl: string;
  apiKey: string;
  displayName: string;
  maxOutputTokens: number;
  noImageSupport: boolean;
  provider: string;
};

type DroidSettings = JsonRecord & {
  customModels?: DroidCustomModel[];
};

type DroidSettingsPayload = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  models?: string[];
  activeModel?: string;
};

type NodeError = Error & {
  code?: string;
};

const getDroidDir = (): string => path.join(os.homedir(), ".factory");
const getDroidSettingsPath = (): string => path.join(getDroidDir(), "settings.json");

const checkDroidInstalled = async (): Promise<boolean> => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where droid" : "which droid";
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { cwd: SAFE_EXEC_CWD, windowsHide: true, env });
    return true;
  } catch {
    try {
      await fs.access(getDroidSettingsPath());
      return true;
    } catch {
      return false;
    }
  }
};

const readSettings = async (): Promise<DroidSettings | null> => {
  try {
    const settingsPath = getDroidSettingsPath();
    const content = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(content) as DroidSettings;
  } catch (error) {
    if ((error as NodeError).code === "ENOENT") return null;
    throw error;
  }
};

const hasAxonRouterConfig = (settings: DroidSettings | null): boolean => {
  if (!settings || !settings.customModels) return false;
  return settings.customModels.some((model) => model.id?.startsWith("custom:AxonRouter"));
};

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const isInstalled = await checkDroidInstalled();

    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        settings: null,
        message: "Factory Droid CLI is not installed",
      });
    }

    const settings = await readSettings();

    return NextResponse.json({
      installed: true,
      settings,
      hasAxonRouter: hasAxonRouterConfig(settings),
      settingsPath: getDroidSettingsPath(),
    });
  } catch (error) {
    console.log("Error checking droid settings:", error);
    return NextResponse.json({ error: "Failed to check droid settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { baseUrl, apiKey, model, models, activeModel } =
      (await request.json()) as DroidSettingsPayload;

    const modelsArray = Array.isArray(models)
      ? models.slice()
      : typeof model === "string"
        ? [model]
        : [];

    if (!baseUrl || modelsArray.length === 0) {
      return NextResponse.json({ error: "baseUrl and at least one model are required" }, { status: 400 });
    }

    const droidDir = getDroidDir();
    const settingsPath = getDroidSettingsPath();

    await fs.mkdir(droidDir, { recursive: true });

    let settings: DroidSettings = {};
    try {
      const existingSettings = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(existingSettings) as DroidSettings;
    } catch {
      // No existing settings.
    }

    if (!settings.customModels) {
      settings.customModels = [];
    }

    settings.customModels = settings.customModels.filter(
      (customModel) => !customModel.id?.startsWith("custom:AxonRouter")
    );

    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    const keyToUse = apiKey || "your_api_key";

    let defaultIndex = 0;
    if (typeof activeModel === "string") {
      if (activeModel === "") {
        defaultIndex = -1;
      } else {
        const index = modelsArray.indexOf(activeModel);
        defaultIndex = index >= 0 ? index : 0;
      }
    }

    for (let i = 0; i < modelsArray.length; i++) {
      const currentModel = modelsArray[i];
      if (!currentModel || typeof currentModel !== "string") continue;
      settings.customModels.push({
        model: currentModel,
        id: `custom:AxonRouter-${i}`,
        index: i,
        baseUrl: normalizedBaseUrl,
        apiKey: keyToUse,
        displayName: currentModel,
        maxOutputTokens: 131072,
        noImageSupport: false,
        provider: "openai",
      });
    }

    if (defaultIndex >= 0 && settings.customModels[defaultIndex]) {
      const [defaultEntry] = settings.customModels.splice(defaultIndex, 1);
      settings.customModels.unshift({ ...defaultEntry, index: 0 });
      settings.customModels.forEach((customModel, index) => {
        customModel.index = index;
      });
    }

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    return NextResponse.json({
      success: true,
      message: "Factory Droid settings applied successfully!",
      settingsPath,
    });
  } catch (error) {
    console.log("Error updating droid settings:", error);
    return NextResponse.json({ error: "Failed to update droid settings" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const settingsPath = getDroidSettingsPath();

    let settings: DroidSettings = {};
    try {
      const existingSettings = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(existingSettings) as DroidSettings;
    } catch (error) {
      if ((error as NodeError).code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No settings file to reset",
        });
      }
      throw error;
    }

    if (settings.customModels) {
      settings.customModels = settings.customModels.filter(
        (customModel) => !customModel.id?.startsWith("custom:AxonRouter")
      );

      if (settings.customModels.length === 0) {
        delete settings.customModels;
      }
    }

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

    return NextResponse.json({
      success: true,
      message: "AxonRouter settings removed successfully",
    });
  } catch (error) {
    console.log("Error resetting droid settings:", error);
    return NextResponse.json({ error: "Failed to reset droid settings" }, { status: 500 });
  }
}

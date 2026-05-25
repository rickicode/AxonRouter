import { NextResponse } from "next/server";
import { CODEX_DEFAULT_INSTRUCTIONS } from "../../../../../../open-sse/config/codexInstructions";
import {
  CODEX_INSTRUCTIONS_FILENAME,
  CODEX_INSTRUCTIONS_FILE_PATH,
  deleteCustomCodexInstructionsFile,
  normalizeCodexInstructionsSettings,
  readCustomCodexInstructionsFile,
  writeCustomCodexInstructionsFile,
} from "../../../../../../open-sse/config/codexInstructionsResolver";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";

const MAX_CUSTOM_INSTRUCTIONS_BYTES = 200 * 1024; // 200 KB safety cap

type CodexInstructionsMode = "default" | "custom";

type CodexInstructionsPayload = {
  enabled: boolean;
  mode: CodexInstructionsMode;
  hasCustomFile: boolean;
  customContent: string;
  customLength: number;
  effectiveContent: string;
  effectiveLength: number;
  defaultContent: string;
  defaultLength: number;
  filename: string;
  filePath: string;
  maxBytes: number;
};

type PutRequestBody = {
  enabled?: boolean;
  mode?: CodexInstructionsMode;
  reset?: boolean;
  content?: string;
};

function normalizeMode(value: unknown): CodexInstructionsMode {
  return value === "custom" ? "custom" : "default";
}

async function buildPayload(): Promise<CodexInstructionsPayload> {
  const settings: any = await getCurrentSettings();
  const cfg = normalizeCodexInstructionsSettings(settings?.codexInstructions) as any;
  const customContent = await readCustomCodexInstructionsFile();
  const hasCustomFile = customContent !== null;

  let effectiveContent: string;
  if (!cfg.enabled) {
    effectiveContent = "";
  } else if (cfg.mode === "custom" && hasCustomFile && customContent.length > 0) {
    effectiveContent = customContent;
  } else {
    effectiveContent = CODEX_DEFAULT_INSTRUCTIONS;
  }

  return {
    enabled: cfg.enabled,
    mode: normalizeMode(cfg.mode),
    hasCustomFile,
    customContent: customContent ?? "",
    customLength: customContent ? customContent.length : 0,
    effectiveContent,
    effectiveLength: effectiveContent.length,
    defaultContent: CODEX_DEFAULT_INSTRUCTIONS,
    defaultLength: CODEX_DEFAULT_INSTRUCTIONS.length,
    filename: CODEX_INSTRUCTIONS_FILENAME,
    filePath: CODEX_INSTRUCTIONS_FILE_PATH,
    maxBytes: MAX_CUSTOM_INSTRUCTIONS_BYTES,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const payload = await buildPayload();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read Codex instructions settings", message: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  let body: PutRequestBody;
  try {
    body = (await request.json()) as PutRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const currentSettings: any = await getCurrentSettings();
  const currentCfg = normalizeCodexInstructionsSettings(currentSettings?.codexInstructions) as any;

  const next: { enabled: boolean; mode: CodexInstructionsMode } = {
    enabled: currentCfg.enabled !== false,
    mode: normalizeMode(currentCfg.mode),
  };
  if (typeof body.enabled === "boolean") {
    next.enabled = body.enabled;
  }
  if (body.mode === "default" || body.mode === "custom") {
    next.mode = body.mode;
  }

  let fileMutation: "write" | "delete" | null = null;
  let writeContent: string | null = null;

  if (body.reset === true) {
    fileMutation = "delete";
    next.mode = "default";
  } else if (typeof body.content === "string") {
    if (Buffer.byteLength(body.content, "utf8") > MAX_CUSTOM_INSTRUCTIONS_BYTES) {
      return NextResponse.json(
        { error: `Custom instructions exceed ${MAX_CUSTOM_INSTRUCTIONS_BYTES} bytes` },
        { status: 400 },
      );
    }
    if (body.content.length === 0) {
      fileMutation = "delete";
      next.mode = "default";
    } else {
      fileMutation = "write";
      writeContent = body.content;
      if (body.mode !== "default") {
        next.mode = "custom";
      }
    }
  }

  try {
    if (fileMutation === "write" && writeContent !== null) {
      await writeCustomCodexInstructionsFile(writeContent);
    } else if (fileMutation === "delete") {
      await deleteCustomCodexInstructionsFile();
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update custom instructions file", message: getErrorMessage(error) },
      { status: 500 },
    );
  }

  await updateCurrentSettings({ codexInstructions: { enabled: next.enabled, mode: next.mode } });

  const payload = await buildPayload();
  return NextResponse.json(payload);
}

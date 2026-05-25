import { NextResponse } from "next/server";
import { MORPH_DEFAULT_INSTRUCTIONS } from "../../../../../../open-sse/config/morphInstructions";
import {
  MORPH_INSTRUCTIONS_FILENAME,
  deleteCustomMorphInstructionsFile,
  normalizeMorphInstructionsSettings,
  readCustomMorphInstructionsFile,
  resolveMorphInstructionsFromConfig,
  writeCustomMorphInstructionsFile,
} from "../../../../../../open-sse/config/morphInstructionsResolver";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";

const MAX_CUSTOM_INSTRUCTIONS_BYTES = 200 * 1024;

type MorphInstructionsMode = "default" | "custom";

type MorphInstructionsPayload = {
  enabled?: boolean;
  mode?: MorphInstructionsMode;
  content?: string;
  reset?: boolean;
};

type ErrorWithMessage = {
  message?: string;
};

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return (error as ErrorWithMessage).message || String(error);
  }

  return String(error);
}

async function buildPayload() {
  const settings = await getCurrentSettings();
  const cfg = normalizeMorphInstructionsSettings(settings?.morphInstructions);
  const customContent = await readCustomMorphInstructionsFile();
  const hasCustomFile = customContent !== null;

  const effectiveContent = resolveMorphInstructionsFromConfig(
    settings?.morphInstructions,
    customContent,
  );

  return {
    enabled: cfg.enabled,
    mode: cfg.mode,
    hasCustomFile,
    customContent: customContent ?? "",
    customLength: customContent ? customContent.length : 0,
    effectiveContent,
    effectiveLength: effectiveContent.length,
    defaultContent: MORPH_DEFAULT_INSTRUCTIONS,
    defaultLength: MORPH_DEFAULT_INSTRUCTIONS.length,
    filename: MORPH_INSTRUCTIONS_FILENAME,
    filePath: MORPH_INSTRUCTIONS_FILENAME,
    maxBytes: MAX_CUSTOM_INSTRUCTIONS_BYTES,
  };
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const payload = await buildPayload();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read Morph instructions settings", message: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  let body: MorphInstructionsPayload;
  try {
    body = (await request.json()) as MorphInstructionsPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const currentSettings = await getCurrentSettings();
  const currentCfg = normalizeMorphInstructionsSettings(currentSettings?.morphInstructions);

  const next = { ...currentCfg };
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
      await writeCustomMorphInstructionsFile(writeContent);
    } else if (fileMutation === "delete") {
      await deleteCustomMorphInstructionsFile();
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update custom instructions file", message: getErrorMessage(error) },
      { status: 500 },
    );
  }

  await updateCurrentSettings({ morphInstructions: { enabled: next.enabled, mode: next.mode } });

  const payload = await buildPayload();
  return NextResponse.json(payload);
}

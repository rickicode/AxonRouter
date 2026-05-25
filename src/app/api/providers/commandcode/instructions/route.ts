import { NextResponse } from "next/server";
import { COMMANDCODE_DEFAULT_INSTRUCTIONS } from "../../../../../../open-sse/config/commandcodeInstructions";
import {
  COMMANDCODE_INSTRUCTIONS_FILENAME,
  deleteCustomCommandCodeInstructionsFile,
  normalizeCommandCodeInstructionsSettings,
  readCustomCommandCodeInstructionsFile,
  resolveCommandCodeInstructionsFromConfig,
  writeCustomCommandCodeInstructionsFile,
} from "../../../../../../open-sse/config/commandcodeInstructionsResolver";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";

const MAX_CUSTOM_INSTRUCTIONS_BYTES = 200 * 1024;

type CommandCodeInstructionsMode = "default" | "custom";

type CommandCodeInstructionsSettings = {
  enabled: boolean;
  mode: CommandCodeInstructionsMode;
};

type CommandCodeInstructionsPayload = {
  enabled?: unknown;
  mode?: unknown;
  reset?: unknown;
  content?: unknown;
};

type RouteError = {
  message?: string;
};

async function buildPayload() {
  const settings: any = await getCurrentSettings();
  const cfg = normalizeCommandCodeInstructionsSettings(
    settings?.commandcodeInstructions,
  ) as CommandCodeInstructionsSettings;
  const customContent = await readCustomCommandCodeInstructionsFile();
  const hasCustomFile = customContent !== null;

  const effectiveContent = resolveCommandCodeInstructionsFromConfig(
    settings?.commandcodeInstructions,
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
    defaultContent: COMMANDCODE_DEFAULT_INSTRUCTIONS,
    defaultLength: COMMANDCODE_DEFAULT_INSTRUCTIONS.length,
    filename: COMMANDCODE_INSTRUCTIONS_FILENAME,
    filePath: COMMANDCODE_INSTRUCTIONS_FILENAME,
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
    const routeError = error as RouteError | undefined;
    return NextResponse.json(
      {
        error: "Failed to read Command Code instructions settings",
        message: routeError?.message || String(error),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  let body: CommandCodeInstructionsPayload;
  try {
    body = (await request.json()) as CommandCodeInstructionsPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const currentSettings: any = await getCurrentSettings();
  const currentCfg = normalizeCommandCodeInstructionsSettings(
    currentSettings?.commandcodeInstructions,
  ) as CommandCodeInstructionsSettings;

  const next: CommandCodeInstructionsSettings = { ...currentCfg };
  if (typeof body.enabled === "boolean") {
    next.enabled = body.enabled;
  }
  if (body.mode === "default" || body.mode === "custom") {
    next.mode = body.mode;
  }

  let fileMutation: "delete" | "write" | null = null;
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
      await writeCustomCommandCodeInstructionsFile(writeContent);
    } else if (fileMutation === "delete") {
      await deleteCustomCommandCodeInstructionsFile();
    }
  } catch (error) {
    const routeError = error as RouteError | undefined;
    return NextResponse.json(
      {
        error: "Failed to update custom instructions file",
        message: routeError?.message || String(error),
      },
      { status: 500 },
    );
  }

  await updateCurrentSettings({ commandcodeInstructions: { enabled: next.enabled, mode: next.mode } });

  const payload = await buildPayload();
  return NextResponse.json(payload);
}

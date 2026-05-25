import { CODEX_DEFAULT_INSTRUCTIONS } from "../../../open-sse/config/codexInstructions.js";

const DEFAULT_SETTINGS = Object.freeze({ enabled: true, mode: "default" as const });

type InstructionsSettingsInput = {
  enabled?: boolean;
  mode?: string;
} | null | undefined;

export const CODEX_INSTRUCTIONS_FILENAME = "codex-instructions.md";
export const CODEX_INSTRUCTIONS_FILE_PATH = null;

export function normalizeCodexInstructionsSettings(raw: InstructionsSettingsInput) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const enabled = raw.enabled !== false;
  const mode = raw.mode === "custom" ? "custom" : "default";
  return { enabled, mode };
}

export function readCustomCodexInstructionsFile() {
  return null;
}

export function writeCustomCodexInstructionsFile() {}

export function deleteCustomCodexInstructionsFile() {}

export function resolveCodexInstructionsFromConfig(rawSettings: InstructionsSettingsInput, customContent: string | null | undefined) {
  const { enabled, mode } = normalizeCodexInstructionsSettings(rawSettings);
  if (!enabled) return "";
  if (mode === "custom" && typeof customContent === "string" && customContent.length > 0) {
    return customContent;
  }
  return CODEX_DEFAULT_INSTRUCTIONS;
}

export async function resolveCodexInstructionsForRequest() {
  return CODEX_DEFAULT_INSTRUCTIONS;
}

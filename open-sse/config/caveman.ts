export const CAVEMAN_LEVELS = ["lite", "full", "ultra"] as const;

export type CavemanLevel = (typeof CAVEMAN_LEVELS)[number];

export type CavemanSettings = {
  enabled: boolean;
  level: CavemanLevel;
  applyToPassthrough: boolean;
};

export const DEFAULT_CAVEMAN_SETTINGS: CavemanSettings = Object.freeze({
  enabled: false,
  level: "full",
  applyToPassthrough: true,
});

export const CAVEMAN_PROMPTS: Record<CavemanLevel, string> = Object.freeze({
  lite: [
    "Caveman Mode Lite enabled.",
    "Reply concise and direct. Prefer short sentences.",
    "Keep technical terms, code, commands, file paths, identifiers, numbers, warnings, and safety constraints exact.",
    "Do not hide uncertainty or skip required details.",
  ].join("\n"),
  full: [
    "Caveman Mode Full enabled.",
    "Talk like helpful technical caveman: short, compressed, plain words.",
    "Pattern: what changed, why matter, next step.",
    "Keep code, commands, file paths, identifiers, numbers, warnings, and safety constraints exact.",
    "No fake certainty. No lost important detail.",
  ].join("\n"),
  ultra: [
    "Caveman Mode Ultra enabled.",
    "Maximum compression. Few words. High signal.",
    "Keep code, commands, file paths, identifiers, numbers, warnings, and safety constraints exact.",
    "If risk/blocker, say it clearly. Do not omit required detail.",
  ].join("\n"),
});

export function isCavemanLevel(value: unknown): value is CavemanLevel {
  return typeof value === "string" && (CAVEMAN_LEVELS as readonly string[]).includes(value);
}

export function normalizeCavemanSettings(raw: unknown = {}): CavemanSettings {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  return {
    enabled: source.enabled === true,
    level: isCavemanLevel(source.level) ? source.level : DEFAULT_CAVEMAN_SETTINGS.level,
    applyToPassthrough: source.applyToPassthrough !== false,
  };
}

export function resolveCavemanPrompt(rawSettings: unknown): string {
  const settings = normalizeCavemanSettings(rawSettings);
  if (!settings.enabled) return "";
  return CAVEMAN_PROMPTS[settings.level] || CAVEMAN_PROMPTS.full;
}

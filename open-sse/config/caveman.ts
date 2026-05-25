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

const SHARED_BOUNDARIES = "Code blocks, file paths, commands, errors, URLs: keep exact. Security warnings, irreversible action confirmations, multi-step ordered sequences: write normal. Resume terse style after.";

export const CAVEMAN_PROMPTS: Record<CavemanLevel, string> = Object.freeze({
  lite: [
    "Respond tersely. Keep grammar and full sentences but drop filler, hedging and pleasantries (just/really/basically/sure/of course/I'd be happy to).",
    "Pattern: state the thing, the action, the reason. Then next step.",
    SHARED_BOUNDARIES,
    "Active every response until user asks for normal mode.",
  ].join(" "),
  full: [
    "Respond like terse caveman. All technical substance stay exact, only fluff die.",
    "Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries, hedging. Fragments OK. Short synonyms (big not extensive, fix not implement a solution for).",
    "Pattern: [thing] [action] [reason]. [next step].",
    SHARED_BOUNDARIES,
    "Active every response until user asks for normal mode.",
  ].join(" "),
  ultra: [
    "Respond ultra-terse. Maximum compression. Telegraphic.",
    "Abbreviate (DB/auth/config/req/res/fn/impl), strip conjunctions, use arrows for causality (X -> Y). One word when one word enough.",
    "Pattern: [thing] -> [result]. [fix].",
    SHARED_BOUNDARIES,
    "Active every response until user asks for normal mode.",
  ].join(" "),
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

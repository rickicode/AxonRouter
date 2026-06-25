// Smart router - feature extraction
// Extract routing features from normalized request

import { DEFAULT_COMPILED, type compileTaskClasses } from "./task-classes";

type Compiled = ReturnType<typeof compileTaskClasses>;

export interface NormalizedRequest {
  allText: string;
  latestUserText: string;
  systemText: string;
  messageCount: number;
  toolCount: number;
  hasImage: boolean;
  hasStructuredOutput: boolean;
  reasoningEffort: string | null;
}

export interface Features {
  text: string;
  chars: number;
  estimatedTokens: number;
  flags: Record<string, boolean>;
  task: string;
  ruleScore: number;
  ruleConfidence: number;
  signalCount: number;
  hardFloor: "medium" | "high" | null;
}

function matched(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

function chooseTask(flags: Record<string, boolean>, taskClasses: Compiled["taskClasses"]): string {
  return taskClasses.find((tc) => flags[tc.id])?.id || "general";
}

function strongestHardFloor(classes: Compiled["classes"], flags: Record<string, boolean>): "medium" | "high" | null {
  if (classes.some((tc) => flags[tc.id] && tc.hardFloor === "high")) return "high";
  if (classes.some((tc) => flags[tc.id] && tc.hardFloor === "medium")) return "medium";
  return null;
}

function ruleConfidence(score: number, thresholds: { medium: number; high: number }, signalCount: number): number {
  const distance = Math.min(Math.abs(score - thresholds.medium), Math.abs(score - thresholds.high));
  const distanceConfidence = Math.min(1, distance / 20);
  const signalConfidence = Math.min(1, signalCount / 5);
  return Number((0.45 + distanceConfidence * 0.35 + signalConfidence * 0.2).toFixed(3));
}

export function extractFeatures(
  normalized: NormalizedRequest,
  thresholds: { medium: number; high: number },
  compiled: Compiled = DEFAULT_COMPILED,
): Features {
  const text = `${normalized.systemText}\n${normalized.latestUserText}`.trim();
  const flags = Object.fromEntries(compiled.classes.map((tc) => [tc.id, matched(tc.patterns, text)]));
  const chars = normalized.allText.length;

  let score = chars < 400 ? 5 : chars < 2000 ? 15 : chars < 8000 ? 25 : 35;
  if (normalized.messageCount > 6) score += 5;
  if (normalized.messageCount > 15) score += 5;
  score += Math.min(15, normalized.toolCount * 3);
  if (normalized.hasStructuredOutput) score += 10;
  for (const tc of compiled.classes) {
    if (flags[tc.id]) score += tc.scoreDelta;
  }
  if (["high", "xhigh", "enabled"].includes(String(normalized.reasoningEffort).toLowerCase())) {
    score += 20;
  }
  score = Math.max(0, Math.min(100, score));

  const signalCount =
    Object.values(flags).filter(Boolean).length +
    Number(normalized.toolCount > 0) +
    Number(normalized.hasStructuredOutput);

  return {
    text,
    chars,
    estimatedTokens: Math.ceil(chars / 4),
    flags,
    task: chooseTask(flags, compiled.taskClasses),
    ruleScore: score,
    ruleConfidence: ruleConfidence(score, thresholds, signalCount),
    signalCount,
    hardFloor: strongestHardFloor(compiled.classes, flags),
  };
}

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fromRepoRoot = (file: string) => resolve(import.meta.dirname, "../..", file);
const readSource = (file: string) => readFileSync(fromRepoRoot(file), "utf8");

const usageSupportFiles = [
  "src/shared/components/UsageStats.tsx",
  "src/shared/components/RequestLogger.tsx",
];

const legacyUtilityPatterns = [
  /\bbg-bg\b/,
  /\bbg-surface\b/,
  /\bbg-sidebar\b/,
  /\btext-text-(?:main|muted|primary|subtle)\b/,
  /\btext-primary\b/,
  /\bborder-border\b/,
  /\bborder-primary\b/,
  /\bfocus:border-primary\b/,
];

describe("usage support premium surface contract", () => {
  it("keeps shared usage and logging surfaces free of legacy styling aliases", () => {
    const offenders = usageSupportFiles.flatMap((file) => {
      const source = readSource(file);
      return legacyUtilityPatterns.some((pattern) => pattern.test(source)) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });
});

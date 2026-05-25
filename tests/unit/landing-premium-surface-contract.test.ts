import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fromRepoRoot = (file: string) => resolve(import.meta.dirname, "../..", file);
const readSource = (file: string) => readFileSync(fromRepoRoot(file), "utf8");

const landingSurfaceFiles = [
  "src/shared/components/Footer.tsx",
  "src/app/landing/page.tsx",
  "src/app/landing/components/Navigation.tsx",
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

describe("landing premium surface contract", () => {
  it("keeps shared landing and footer surfaces free of legacy styling aliases", () => {
    const offenders = landingSurfaceFiles.flatMap((file) => {
      const source = readSource(file);
      return legacyUtilityPatterns.some((pattern) => pattern.test(source)) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });
});

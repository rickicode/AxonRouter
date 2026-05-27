import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

const runGit = (args: string[]) => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw result.error || new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const trackedFiles = () =>
  runGit(["ls-files", "--others", "--cached", "--exclude-standard"]);

const jsFiles = () =>
  runGit([
    "ls-files",
    "--others",
    "--cached",
    "--exclude-standard",
    "--",
    "*.js",
    "*.jsx",
    "*.mjs",
    "*.cjs",
    ":!:node_modules/**",
    ":!:.next/**",
    ":!:dist/**",
    ":!:coverage/**",
    ":!:build/**",
  ]);

const allowedRuntimeJsFiles = new Set([
  "bin/axonrouter.js",
  "scripts/start.js",
  "scripts/ensure-middleware-manifest.js",
  "scripts/mcp-stdio.js",
  "scripts/service.js",
  "scripts/postinstall.js",
  "packages/data-dir/src/index.js",
]);

const legacyDefaultFiles = () => {
  const pattern = "9router|9router-plus|\\.9router";
  try {
    return runGit([
      "grep",
      "-IlEi",
      pattern,
      "--",
      ":!:*-lock.json",
      ":!:cloud/**",
      ":!:WorkerProxy/**",
    ]);
  } catch {
    return [];
  }
};

describe("AxonRouter modernization inventory", () => {
  it("only keeps required JavaScript launcher shims", () => {
    const unexpected = jsFiles().filter((file) => !allowedRuntimeJsFiles.has(file));
    expect(unexpected).toEqual([]);
  });

  it("keeps unit tests in tests/unit only", () => {
    const nestedUnitTests = trackedFiles().filter((file) =>
      file.startsWith("tests/tests/unit/"),
    );

    expect(nestedUnitTests).toEqual([]);
  });

  it("removes legacy 9router default identity strings", () => {
    const allowed = new Set([
      "AGENTS.md",
      ".until-done/tasks.yaml",
      "tests/unit/modernization-inventory.test.ts",
      "unit/modernization-inventory.test.ts",
      "skills/axonrouter-unified/SKILL.md",
    ]);
    const offenders = legacyDefaultFiles().filter((file) => !allowed.has(file));

    expect(offenders).toEqual([]);
  });
});

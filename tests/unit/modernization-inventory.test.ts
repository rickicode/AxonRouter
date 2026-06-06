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

// These are the JS files intentionally kept as JavaScript (not yet migrated to TS).
// The CLI package JS files are tracked here until CLI migration to TypeScript.
const allowedRuntimeJsFiles = new Set([
  "scripts/start.js",
  "scripts/ensure-middleware-manifest.js",
  "scripts/mcp-stdio.js",
  "scripts/service.js",
  "scripts/postinstall.js",
  "packages/data-dir/src/index.js",
  "next.config.mjs",
  "postcss.config.mjs",
  // CLI package — not yet migrated to TypeScript
  "packages/cli/cli.js",
  "packages/cli/hooks/postinstall.js",
  "packages/cli/hooks/sqliteRuntime.js",
  "packages/cli/hooks/trayRuntime.js",
  "packages/cli/scripts/build-cli.js",
  "packages/cli/src/api/client.js",
  "packages/cli/src/menus/apiKeys.js",
  "packages/cli/src/menus/cliTools.js",
  "packages/cli/src/menus/combos.js",
  "packages/cli/src/menus/providers.js",
  "packages/cli/src/menus/settings.js",
  "packages/cli/src/terminalUI.js",
  "packages/cli/src/tray/autostart.js",
  "packages/cli/src/tray/tray.js",
  "packages/cli/src/tray/trayShared.js",
  "packages/cli/src/tray/trayWin.js",
  "packages/cli/src/utils/clipboard.js",
  "packages/cli/src/utils/display.js",
  "packages/cli/src/utils/endpoint.js",
  "packages/cli/src/utils/format.js",
  "packages/cli/src/utils/input.js",
  "packages/cli/src/utils/menuHelper.js",
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

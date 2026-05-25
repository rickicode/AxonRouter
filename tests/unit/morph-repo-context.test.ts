import { beforeEach, describe, expect, it, vi } from "vitest";

const execSync = vi.fn();

vi.mock("node:child_process", () => ({ execSync }));

describe("Morph repo context", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    execSync.mockReturnValue("");
  });

  it("builds commandcode-style repository context object", async () => {
    execSync.mockImplementation((command) => {
      if (command.includes("git rev-parse --show-toplevel")) return "/workspaces/axonrouter\n";
      if (command.includes("git branch --show-current")) return "main\n";
      if (command.includes("git symbolic-ref --short refs/remotes/origin/HEAD")) return "origin/main\n";
      if (command.includes("git status --short | wc -l")) return "2\n";
      if (command.includes("git status --short | awk '$1 ~ /D/")) return "0\n";
      if (command.includes("git status --short | awk '$1 ~ /\\?\\?/")) return "1\n";
      if (command.includes("git log --oneline -3")) return "abc123 fix morph\n";
      if (command.includes("find . -maxdepth 1 -mindepth 1 -type d")) return "src\ntests\n";
      return "";
    });

    const { buildMorphRepoContext } = await import("../../src/lib/morph/repoContext.ts");
    const context = buildMorphRepoContext();

    expect(context.workingDir).toBe(process.cwd());
    expect(context.currentBranch).toBe("main");
    expect(context.mainBranch).toBe("main");
    expect(context.structure).toEqual(["src", "tests"]);
    expect(context.recentCommits).toEqual(["abc123 fix morph"]);
  });
});

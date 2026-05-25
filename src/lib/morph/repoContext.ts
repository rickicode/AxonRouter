import { execSync } from "node:child_process";

function getGitOutput(command) {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function getWorkspaceStructure() {
  try {
    return execSync("find . -maxdepth 1 -mindepth 1 -type d | sed 's#^./##' | sort", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function buildMorphRepoContext() {
  const workingDir = process.cwd();
  const gitRoot = getGitOutput("git rev-parse --show-toplevel");
  const isGitRepo = Boolean(gitRoot);
  const currentBranch = isGitRepo ? getGitOutput("git branch --show-current") : "";
  const mainBranch = isGitRepo
    ? (getGitOutput("git symbolic-ref --short refs/remotes/origin/HEAD").split("/").pop() || "main")
    : "";
  const gitStatus = isGitRepo
    ? (() => {
        const modified = getGitOutput("git status --short | wc -l | tr -d ' '");
        const deleted = getGitOutput("git status --short | awk '$1 ~ /D/ || $2 ~ /D/ {count++} END {print count+0}'");
        const untracked = getGitOutput("git status --short | awk '$1 ~ /\\?\\?/ {count++} END {print count+0}'");
        return `M ${modified || 0}, D ${deleted || 0}, ?? ${untracked || 0}`;
      })()
    : "";
  const recentCommits = isGitRepo
    ? getGitOutput("git log --oneline -3").split("\n").filter(Boolean)
    : [];

  return {
    workingDir,
    date: new Date().toISOString().split("T")[0],
    environment: `${process.platform}-${process.arch}, Node.js ${process.version}`,
    structure: getWorkspaceStructure(),
    isGitRepo,
    currentBranch,
    mainBranch,
    gitStatus,
    recentCommits,
  };
}

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".axonrouter",
  "runtime"
);

function requireFromRuntime(moduleName) {
  try {
    const runtimeRequire = createRequire(join(DATA_DIR, "node_modules"));
    return runtimeRequire(moduleName);
  } catch {
    return null;
  }
}

export async function ensureSqliteRuntime() {
  const nodeModulesDir = join(DATA_DIR, "node_modules");
  const betterSqliteDir = join(nodeModulesDir, "better-sqlite3");

  // Skip if already installed
  if (existsSync(join(betterSqliteDir, "build", "Release", "better_sqlite3.node"))) {
    try {
      requireFromRuntime("better-sqlite3");
      return; // Already working
    } catch {
      // Binary exists but can't load — reinstall
    }
  }

  mkdirSync(nodeModulesDir, { recursive: true });

  console.log("  🔧 Checking SQLite runtime for AxonRouter...");

  try {
    execSync("npm install better-sqlite3@latest --no-audit --no-fund --omit=dev", {
      cwd: DATA_DIR,
      stdio: "pipe",
      timeout: 300_000,
      env: { ...process.env, npm_config_prefix: DATA_DIR },
    });
    console.log("  ✅ SQLite runtime ready.");
  } catch {
    console.log("  ℹ️  SQLite runtime setup skipped (will retry on first start).");
  }
}

export function buildEnvWithRuntime(baseEnv = process.env) {
  const runtimeNm = join(DATA_DIR, "node_modules");
  const bundledNm = join(__dirname, "..", "app", "node_modules");
  const existing = baseEnv.NODE_PATH || "";
  const NODE_PATH = [runtimeNm, bundledNm, existing].filter(Boolean).join(delimiter);
  return { ...baseEnv, NODE_PATH };
}

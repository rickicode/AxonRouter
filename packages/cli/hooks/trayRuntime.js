import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".axonrouter",
  "runtime"
);

export async function ensureTrayRuntime() {
  // Windows uses PowerShell — no additional runtime needed
  if (process.platform === "win32") return;

  // macOS / Linux — ensure systray2 is available
  const systrayDir = join(DATA_DIR, "node_modules", "systray2");

  if (existsSync(systrayDir)) {
    try {
      const { createRequire } = await import("node:module");
      const runtimeRequire = createRequire(join(DATA_DIR, "node_modules"));
      runtimeRequire("systray2");
      return; // Already available
    } catch {
      // Reinstall
    }
  }

  mkdirSync(DATA_DIR, { recursive: true });

  try {
    execSync("npm install systray2@latest --no-audit --no-fund --omit=dev", {
      cwd: DATA_DIR,
      stdio: "pipe",
      timeout: 120_000,
      env: { ...process.env, npm_config_prefix: DATA_DIR },
    });
  } catch {
    // Non-critical — will try again on first start
  }
}

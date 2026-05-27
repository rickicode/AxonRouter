#!/usr/bin/env node

/**
 * AxonRouter - Postinstall Native Module Fix
 *
 * The npm package ships with a Next.js standalone build that includes
 * native modules compiled for the build platform inside
 * .next/standalone/.next/node_modules/. However, npm also installs these
 * as top-level dependencies (in root node_modules/), correctly compiled
 * for the user's platform and Node.js version.
 *
 * This script copies the correctly-built native binary from root
 * node_modules/ into the standalone directory - no rebuild or build
 * tools needed on the user's machine in the common case.
 *
 * Module repaired:
 *   - better-sqlite3 (SQLite bindings)
 *
 * Fixes: ERR_DLOPEN_FAILED when the pre-built binary doesn't match
 * the user's Node.js version/platform.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

/**
 * Find the standalone better-sqlite3 directory.
 * Next.js standalone bundles use hashed directory names like:
 *   .next/standalone/.next/node_modules/better-sqlite3-<hash>/
 */
function findStandaloneSqliteDir() {
  const standaloneModules = join(ROOT, ".next", "standalone", ".next", "node_modules");
  if (!existsSync(standaloneModules)) {
    return null;
  }

  try {
    const entries = readdirSync(standaloneModules);
    const sqliteDir = entries.find((e) => e.startsWith("better-sqlite3"));
    if (sqliteDir) {
      return join(standaloneModules, sqliteDir);
    }
  } catch {
    // Directory not readable
  }
  return null;
}

/**
 * Try to load a native binary via dlopen to verify it works.
 * Returns true if it loads, false otherwise.
 */
function tryLoad(binaryPath) {
  try {
    process.dlopen({ exports: {} }, binaryPath);
    return true;
  } catch {
    return false;
  }
}

async function fixBetterSqliteBinary() {
  const standaloneDir = findStandaloneSqliteDir();
  if (!standaloneDir) {
    // No standalone bundle present (e.g. development environment)
    return;
  }

  const standaloneBinary = join(standaloneDir, "build", "Release", "better_sqlite3.node");
  const rootBinary = join(
    ROOT,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node"
  );

  // Fast path: check if the standalone binary already works
  if (existsSync(standaloneBinary) && tryLoad(standaloneBinary)) {
    console.log("  \u2705 better-sqlite3 binary is compatible, no fix needed.");
    return;
  }

  console.log(
    `\n  \uD83D\uDD27 Fixing better-sqlite3 binary for ${process.platform}-${process.arch} (Node ${process.version})...`
  );

  // Strategy 1: Copy from root node_modules (npm compiled it for this platform)
  if (existsSync(rootBinary)) {
    try {
      mkdirSync(dirname(standaloneBinary), { recursive: true });
      copyFileSync(rootBinary, standaloneBinary);
    } catch (err) {
      console.warn(`  \u26A0\uFE0F  Failed to copy binary: ${err.message}`);
    }

    if (tryLoad(standaloneBinary)) {
      console.log("  \u2705 Fixed! Copied compatible binary from root node_modules.\n");
      return;
    } else {
      console.warn("  \u26A0\uFE0F  Copied binary failed to load.");
    }
  } else {
    console.warn("  \u26A0\uFE0F  Root binary not found at: " + rootBinary);
  }

  // Strategy 2: npm rebuild inside the standalone directory
  console.log("  \uD83D\uDCE6 Attempting npm rebuild better-sqlite3...");
  try {
    const { execSync } = await import("node:child_process");
    const standaloneRoot = join(ROOT, ".next", "standalone");
    execSync("npm rebuild better-sqlite3", {
      cwd: standaloneRoot,
      stdio: "inherit",
      timeout: 300_000,
    });

    if (tryLoad(standaloneBinary)) {
      console.log("  \u2705 Fixed! Rebuilt better-sqlite3 successfully.\n");
      return;
    }
  } catch (err) {
    const isTimeout = err.killed || err.signal === "SIGTERM";
    if (isTimeout) {
      console.warn("  \u26A0\uFE0F  npm rebuild timed out after 300s.");
    } else {
      console.warn(`  \u26A0\uFE0F  npm rebuild failed: ${err.message}`);
    }
  }

  // All strategies failed - print manual instructions
  console.warn("\n  \u26A0\uFE0F  Could not fix better-sqlite3 native module automatically.");
  console.warn("     The server may not start correctly.");
  console.warn("     Manual fix:");
  console.warn(`     cd "${join(ROOT, ".next", "standalone")}" && npm rebuild better-sqlite3`);
  if (process.platform === "darwin") {
    console.warn("     If build tools are missing: xcode-select --install");
  } else if (process.platform === "win32") {
    console.warn(
      "     Requires Build Tools for Visual Studio: https://visualstudio.microsoft.com/visual-cpp-build-tools/"
    );
  }
  console.warn("");
}

// Main - never fail the install
try {
  await fixBetterSqliteBinary();
} catch (err) {
  console.warn(`  \u26A0\uFE0F  postinstall: unexpected error: ${err.message}`);
  // Silently continue - don't break npm install
}

#!/usr/bin/env node

/**
 * AxonRouter CLI — Build Script
 *
 * Packages the CLI alongside the main application for distribution.
 * Copies necessary runtime files and ensures the CLI is ready for production.
 */

import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = join(__dirname, "..");
const ROOT_DIR = join(CLI_DIR, "..", "..");

console.log("\n  ═══ AxonRouter CLI Build ═══\n");

// Step 1: Ensure CLI dependencies are installed
console.log("  ■ Installing CLI dependencies...");
try {
  execSync("npm install --no-audit --no-fund --ignore-scripts", {
    cwd: CLI_DIR,
    stdio: "pipe",
    timeout: 120000,
  });
  console.log("  ✅ CLI dependencies installed.\n");
} catch (err) {
  console.warn(`  ⚠️  npm install warning: ${err.message}\n`);
}

// Step 2: Copy tray icon (try PNG first, fall back to SVG)
console.log("  ■ Setting up tray assets...");
const iconDir = join(CLI_DIR, "src", "tray");
mkdirSync(iconDir, { recursive: true });

const iconCandidates = [
  join(ROOT_DIR, "public", "favicon.png"),
  join(ROOT_DIR, "public", "icon.png"),
  join(ROOT_DIR, "public", "favicon.svg"),
];

let iconCopied = false;
for (const src of iconCandidates) {
  if (existsSync(src)) {
    const ext = src.endsWith(".png") ? "png" : "svg";
    cpSync(src, join(iconDir, `icon.${ext}`), { force: true });
    iconCopied = true;
    console.log(`  ✅ Tray icon copied (${ext}).\n`);
    break;
  }
}

if (!iconCopied) {
  // Generate a minimal 1x1 blue PNG as fallback so systray doesn't fail
  // This is a well-known valid minimal PNG (1x1 pixel, RGB, blue)
  const minPng = Buffer.from([
    0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A, // PNG signature
    0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52, // IHDR chunk length + type
    0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, // width=1, height=1
    0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53,0xDE, // bit_depth=8, color_type=RGB, CRC
    0x00,0x00,0x00,0x0C,0x49,0x44,0x41,0x54, // IDAT chunk length=12 + type
    0x08,0xD7,0x63,0x60,0x60,0x00,0x00,0x00,0x02,0x00,0x01, // compressed data (11 bytes)
    0xE5,0x27,0xDE,0x3C, // IDAT CRC
    0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44, // IEND length=0 + type
    0xAE,0x42,0x60,0x82, // IEND CRC
  ]);
  writeFileSync(join(iconDir, "icon.png"), minPng);
  console.log("  ℹ️  Generated minimal placeholder icon.\n");
}

// Step 3: Verify CLI entrypoint
const cliEntry = join(CLI_DIR, "cli.js");
if (existsSync(cliEntry)) {
  console.log(`  ✅ CLI entrypoint: ${cliEntry}\n`);
} else {
  console.error(`  ❌ CLI entrypoint not found: ${cliEntry}`);
  process.exit(1);
}

console.log("  ═══ CLI Build Complete ═══\n");

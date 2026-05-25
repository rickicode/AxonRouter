#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const startScript = resolve(__dirname, "..", "scripts", "start.ts");

// Use tsx to run the TypeScript start script
const child = spawn(
  process.execPath,
  ["--import", "tsx", startScript, ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" } }
);

child.on("exit", (code, sig) => process.exit(sig ? 128 + 15 : code ?? 0));

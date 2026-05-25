#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const loaderPath = path.join(projectRoot, "scripts", "mcp-alias-loader.ts");
const serverBin = path.join(projectRoot, "bin", "mcp-server.ts");
const loaderImport = `data:text/javascript,import { register } from "node:module"; import { pathToFileURL } from "node:url"; register(${JSON.stringify(loaderPath)}, pathToFileURL("./"));`;

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--import", loaderImport, serverBin],
  { cwd: projectRoot, stdio: "inherit", env: process.env }
);

child.on("exit", (code, signal) => {
  if (signal) process.exit(128 + (signal === "SIGINT" ? 2 : 15));
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error("[axonrouter:mcp-launcher] Failed to spawn MCP server:", err.message);
  process.exit(1);
});

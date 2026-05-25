#!/usr/bin/env node

import { execArgv } from "node:process";

const isBun = typeof globalThis.Bun !== "undefined";
const hasStripTypes = isBun || execArgv.some((a) => a.includes("strip-types"));

if (!hasStripTypes) {
  // Re-spawn self with TypeScript support enabled
  const { spawn } = await import("node:child_process");
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", ...process.argv.slice(1)],
    { stdio: "inherit" }
  );
  child.on("exit", (code, sig) => process.exit(sig ? 128 + 15 : code ?? 0));
} else {
  // TypeScript support active — run directly.
  // Some Node versions cannot strip TS inside node_modules installs.
  try {
    const { main } = await import("../scripts/start.ts");
    await main();
  } catch (error) {
    const isTypeStripError =
      error &&
      typeof error === "object" &&
      (error.code === "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING" ||
        String(error.message || "").includes("node_modules"));

    if (!isTypeStripError) throw error;

    // Bun can execute TS files from node_modules directly; use it as fallback.
    const { spawn } = await import("node:child_process");
    const child = spawn("bun", [new URL("../scripts/start.ts", import.meta.url).pathname, ...process.argv.slice(2)], {
      stdio: "inherit",
    });
    child.on("exit", (code, sig) => process.exit(sig ? 128 + 15 : code ?? 0));
  }
}

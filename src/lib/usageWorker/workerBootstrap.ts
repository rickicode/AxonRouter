import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

function findProjectRoot(startDir: string) {
  let current = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(current, "package.json")) && existsSync(path.join(current, "src"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startDir, "..", "..", "..");
}

const projectRoot = process.env.WORKER_PROJECT_ROOT ||= findProjectRoot(dirname);

try {
  const { register } = await import("node:module");
  const aliasLoaderPath = path.join(projectRoot, "src", "lib", "usageWorker", "aliasLoader.ts");
  if (existsSync(aliasLoaderPath)) {
    register(aliasLoaderPath, pathToFileURL(`${projectRoot}/`));
  }
} catch {
  // node:module register not available
}

// Prefer source path over standalone copy
const workerPath = path.join(projectRoot, "src", "lib", "usageWorker", "worker.ts");

import(pathToFileURL(workerPath).href).catch((error) => {
  console.error("[UsageWorker] Bootstrap failed:", error);
  process.exit(1);
});

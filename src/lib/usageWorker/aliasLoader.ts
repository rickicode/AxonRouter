import { existsSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = process.env.WORKER_PROJECT_ROOT || process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

function resolveExistingPath(rawPath) {
  if (path.extname(rawPath)) {
    return rawPath;
  }

  if (existsSync(`${rawPath}.ts`)) return `${rawPath}.ts`;
  if (existsSync(`${rawPath}.tsx`)) return `${rawPath}.tsx`;
  if (existsSync(`${rawPath}.js`)) return `${rawPath}.js`;
  if (existsSync(`${rawPath}.mjs`)) return `${rawPath}.mjs`;
  if (existsSync(path.join(rawPath, "index.ts"))) return path.join(rawPath, "index.ts");
  if (existsSync(path.join(rawPath, "index.tsx"))) return path.join(rawPath, "index.tsx");
  if (existsSync(path.join(rawPath, "index.js"))) return path.join(rawPath, "index.js");

  return rawPath;
}

function resolveProjectPath(...segments) {
  const candidatePaths = [
    path.join(standaloneRoot, ...segments),
    path.join(projectRoot, ...segments),
  ];

  for (const candidatePath of candidatePaths) {
    const resolvedPath = resolveExistingPath(candidatePath);
    if (existsSync(resolvedPath)) {
      return pathToFileURL(resolvedPath).href;
    }
  }

  return pathToFileURL(resolveExistingPath(candidatePaths[0])).href;
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && (url.endsWith(".ts") || url.endsWith(".tsx"))) {
    const filename = fileURLToPath(url);
    const source = stripTypeScriptTypes(readFileSync(filename, "utf8"), { mode: "strip" });
    return { format: "module", source, shortCircuit: true };
  }

  return nextLoad(url, context);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parentPath = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL) : null;
    if (parentPath) {
      const resolvedPath = resolveExistingPath(path.resolve(path.dirname(parentPath), specifier));
      if (existsSync(resolvedPath)) {
        return nextResolve(pathToFileURL(resolvedPath).href, context);
      }
    }
  }

  if (specifier.startsWith("@/")) {
    return nextResolve(resolveProjectPath("src", specifier.slice(2)), context);
  }

  if (specifier === "open-sse") {
    return nextResolve(resolveProjectPath("open-sse", "index.js"), context);
  }

  if (specifier.startsWith("open-sse/")) {
    return nextResolve(resolveProjectPath("open-sse", specifier.slice("open-sse/".length)), context);
  }

  return nextResolve(specifier, context);
}

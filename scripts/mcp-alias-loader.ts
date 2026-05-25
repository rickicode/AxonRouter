import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const aliasRoots = {
  "@/lib/": path.join(projectRoot, "src/lib/"),
  "@/shared/": path.join(projectRoot, "src/shared/"),
  "@/models": path.join(projectRoot, "src/models/index.js"),
  "open-sse/": path.join(projectRoot, "open-sse/"),
  "open-sse": path.join(projectRoot, "open-sse/index.js"),
};

function tryFileVariants(candidatePath) {
  return [
    candidatePath,
    `${candidatePath}.ts`,
    `${candidatePath}.tsx`,
    `${candidatePath}.js`,
    `${candidatePath}.mjs`,
    path.join(candidatePath, "index.ts"),
    path.join(candidatePath, "index.tsx"),
    path.join(candidatePath, "index.js"),
    path.join(candidatePath, "index.mjs"),
  ];
}

function resolveExistingFile(candidatePath) {
  for (const candidate of tryFileVariants(candidatePath)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  for (const [alias, target] of Object.entries(aliasRoots)) {
    if (specifier === alias.replace(/\/$/, "")) {
      const resolved = resolveExistingFile(target) || target;
      return defaultResolve(pathToFileURL(resolved).href, context, defaultResolve);
    }
    if (specifier.startsWith(alias)) {
      const rest = specifier.slice(alias.length);
      const resolved = resolveExistingFile(path.join(target, rest));
      if (resolved) {
        return defaultResolve(pathToFileURL(resolved).href, context, defaultResolve);
      }
    }
  }

  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !path.extname(specifier)) {
    const parentPath = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL) : null;
    if (parentPath) {
      const resolved = resolveExistingFile(path.resolve(path.dirname(parentPath), specifier));
      if (resolved) {
        return defaultResolve(pathToFileURL(resolved).href, context, defaultResolve);
      }
    }
  }

  if (specifier.startsWith("/") && !path.extname(specifier)) {
    const resolved = resolveExistingFile(specifier);
    if (resolved) {
      return defaultResolve(pathToFileURL(resolved).href, context, defaultResolve);
    }
  }

  if (specifier.startsWith("file:")) {
    const filePath = fileURLToPath(specifier);
    if (!path.extname(filePath)) {
      const resolved = resolveExistingFile(filePath);
      if (resolved) {
        return defaultResolve(pathToFileURL(resolved).href, context, defaultResolve);
      }
    }
  }

  return defaultResolve(specifier, context, defaultResolve);
}

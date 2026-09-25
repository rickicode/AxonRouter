// Runtime "@"-alias resolver for the gateway (mirrors tsconfig paths:
//   "@/*" -> "src/*", plus "open-sse" already resolves by relative path).
// Loaded via node --import before anything else. Keeps gateway ESM imports
// working without a bundler step.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { statSync } from "node:fs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = path.join(projectRoot, "src", specifier.slice(2));
    const candidates = [
      target,
      `${target}.js`,
      `${target}.mjs`,
      path.join(target, "index.js"),
      path.join(target, "index.mjs"),
    ];
    for (const c of candidates) {
      try {
        if (statSync(c).isFile()) {
          return { url: pathToFileURL(c).href, shortCircuit: true };
        }
      } catch {}
    }
  }
  if (specifier === "open-sse" || specifier.startsWith("open-sse/")) {
    const subpath = specifier === "open-sse" ? "" : specifier.slice("open-sse/".length);
    const target = path.join(projectRoot, "open-sse", subpath);
    const candidates = [
      target,
      `${target}.js`,
      `${target}.mjs`,
      path.join(target, "index.js"),
      path.join(target, "index.mjs"),
    ];
    for (const c of candidates) {
      try {
        if (statSync(c).isFile()) {
          return { url: pathToFileURL(c).href, shortCircuit: true };
        }
      } catch {}
    }
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const parentPath = fileURLToPath(context.parentURL);
    const target = path.resolve(path.dirname(parentPath), specifier);
    const candidates = [
      target,
      `${target}.js`,
      `${target}.mjs`,
      path.join(target, "index.js"),
      path.join(target, "index.mjs"),
    ];
    for (const c of candidates) {
      try {
        if (statSync(c).isFile()) {
          return { url: pathToFileURL(c).href, shortCircuit: true };
        }
      } catch {}
    }
  }
  return nextResolve(specifier, context);
}

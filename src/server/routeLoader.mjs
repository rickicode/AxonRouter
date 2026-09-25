// Filesystem route auto-loader for src/app/api/**/route.js.
// Converts Next.js App Router filesystem conventions to Hono paths:
//   [id]        -> :id
//   [...slug]   -> *slug
// Dynamic params are passed to handlers as Next-style awaited objects
// ({ params: Promise<{...}> }) so existing handlers run unmodified.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const API_ROOT = path.join(projectRoot, "src", "app", "api");

function walkForRouteFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkForRouteFiles(full, acc);
    } else if (entry === "route.js") {
      acc.push(full);
    }
  }
  return acc;
}

function toHonoPath(routeFile) {
  const rel = path.relative(API_ROOT, path.dirname(routeFile));
  const segments = rel.split(path.sep).filter(Boolean);
  const converted = segments.map((seg) => {
    if (seg.startsWith("[...") && seg.endsWith("]")) {
      return `*${seg.slice(4, -1)}`;
    }
    if (seg.startsWith("[") && seg.endsWith("]")) {
      return `:${seg.slice(1, -1)}`;
    }
    return seg;
  });
  return "/api/" + converted.join("/");
}

function buildParamsObject(honoParams, honoPath) {
  const segments = honoPath.split("/").filter(Boolean);
  const params = {};
  for (const seg of segments) {
    if (seg.startsWith("*")) {
      const rest = honoParams[seg.slice(1)] || "";
      params[seg.slice(1)] = String(rest).split("/").filter(Boolean);
    } else if (seg.startsWith(":")) {
      params[seg.slice(1)] = honoParams[seg.slice(1)];
    }
  }
  return params;
}

export async function loadApiRoutes(app) {
  const routeFiles = walkForRouteFiles(API_ROOT);
  const loaded = [];

  for (const file of routeFiles) {
    const mod = await import(pathToFileURL(file).href);
    const methods = API_METHODS.filter((m) => typeof mod[m] === "function");
    if (methods.length === 0) continue;

    const honoPath = toHonoPath(file);

    for (const method of methods) {
      const handler = mod[method];
      app.on(method, honoPath, async (c) => {
        const { runWithRequestContext } = await import("@/lib/http/headers.js");
        const params = buildParamsObject(c.req.param(), honoPath);
        return runWithRequestContext(c.req.raw, () =>
          handler(c.req.raw, { params: Promise.resolve(params) })
        );
      });
      loaded.push(`${method} ${honoPath}`);
    }
  }

  return loaded;
}

export { toHonoPath, buildParamsObject, API_ROOT };

// Filesystem route auto-loader for src/app/api/**/route.js.
// Converts Next.js App Router filesystem conventions to Hono paths:
//   [id]        -> :id
//   [...slug]   -> :slug{.+}
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
      return `:${seg.slice(4, -1)}{.+}`;
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
    if (seg.startsWith(":") && seg.includes("{")) {
      const paramName = seg.slice(1, seg.indexOf("{"));
      const rest = honoParams[paramName] || "";
      params[paramName] = String(rest).split("/").filter(Boolean);
    } else if (seg.startsWith("*")) {
      const rest = honoParams[seg.slice(1)] || "";
      params[seg.slice(1)] = String(rest).split("/").filter(Boolean);
    } else if (seg.startsWith(":")) {
      params[seg.slice(1)] = honoParams[seg.slice(1)];
    }
  }
  return params;
}

function getRouteScore(file) {
  const honoPath = toHonoPath(file);
  const segments = honoPath.split("/").filter(Boolean);
  let score = 0;
  for (const seg of segments) {
    if (seg.startsWith("*") || (seg.startsWith(":") && seg.includes("{"))) {
      score += 10000;
    } else if (seg.startsWith(":")) {
      score += 100;
    } else {
      score += 1;
    }
  }
  return score;
}

export async function loadApiRoutes(app) {
  const routeFiles = walkForRouteFiles(API_ROOT);
  routeFiles.sort((a, b) => {
    const diff = getRouteScore(a) - getRouteScore(b);
    if (diff !== 0) return diff;
    return toHonoPath(b).length - toHonoPath(a).length;
  });
  const loaded = [];

  for (const file of routeFiles) {
    const mod = await import(pathToFileURL(file).href);
    const methods = API_METHODS.filter((m) => typeof mod[m] === "function");
    if (methods.length === 0) continue;

    const honoPath = toHonoPath(file);

    for (const method of methods) {
      const handler = mod[method];
      const hasBody = method !== "GET" && method !== "HEAD";
      app.on(method, honoPath, async (c) => {
        const { runWithRequestContext } = await import("@/lib/http/headers.js");
        const params = buildParamsObject(c.req.param(), honoPath);

        let request = c.req.raw;
        // Depth guard on JSON bodies for the dashboard/control-plane routes.
        // Hot-path /api/v1 (LLM) payloads are excluded: they are large, legitimate,
        // and already size-capped — buffering them here would cost memory for no gain.
        if (hasBody && !honoPath.startsWith("/api/v1") && !honoPath.startsWith("/api/v1beta")) {
          const ctype = c.req.header("content-type") || "";
          if (ctype.includes("application/json")) {
            try {
              const raw = await c.req.text();
              const { assertBoundedJsonTextDepth } = await import("@/lib/security/ingressSecurity.js");
              assertBoundedJsonTextDepth(raw);
              request = new Request(c.req.url, {
                method,
                headers: c.req.raw.headers,
                body: raw,
                duplex: "half",
              });
            } catch (err) {
              if (String(err?.message || "").includes("JSON depth limit exceeded")) {
                return c.json({ error: err.message }, 400);
              }
              throw err;
            }
          }
        }

        const res = await runWithRequestContext(c.req.raw, () =>
          handler(request, { params: Promise.resolve(params) })
        );
        if (res && res.headers) {
          const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
          for (const cookie of setCookies) {
            c.header("set-cookie", cookie, { append: true });
          }
        }
        return res;
      });
      loaded.push(`${method} ${honoPath}`);
    }
  }

  return loaded;
}

export { toHonoPath, buildParamsObject, API_ROOT };

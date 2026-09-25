#!/usr/bin/env node
import { register } from "node:module";
register("../../gateway/alias-resolver.mjs", import.meta.url);

import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { loadApiRoutes } from "./routeLoader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const PORT = Number(process.env.PORT || 3777);
const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
const DIST_DIR = path.join(projectRoot, "dist");

const app = new Hono();

// ── In-Memory Settings Cache (Fast guard path) ────────────────────────────────
let cachedSettings = null;
let settingsCacheExpiresAt = 0;
const SETTINGS_CACHE_TTL_MS = 5000;

async function getCachedSettings() {
  const now = Date.now();
  if (cachedSettings && now < settingsCacheExpiresAt) {
    return cachedSettings;
  }
  try {
    const { getSettings } = await import("@/lib/localDb");
    cachedSettings = await getSettings();
    settingsCacheExpiresAt = now + SETTINGS_CACHE_TTL_MS;
    return cachedSettings;
  } catch {
    return cachedSettings;
  }
}

// ── CLI Token derivation ──────────────────────────────────────────────────────
const CLI_TOKEN_HEADER = "x-axonrouter-cli-token";
const CLI_TOKEN_SALT = "9r-cli-auth";
let cachedCliToken = null;

async function getCliToken() {
  if (!cachedCliToken) {
    const { getConsistentMachineId } = await import("@/shared/utils/machineId");
    cachedCliToken = await getConsistentMachineId(CLI_TOKEN_SALT);
  }
  return cachedCliToken;
}

// ── Auth Guard Constants ──────────────────────────────────────────────────────
const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/metrics",
  "/metrics",
  "/api/init",
  "/api/locale",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
  "/api/auth/oidc",
  "/api/auth/saml",
  "/api/version",
  "/api/settings/require-login",
  "/api/cli-tools/setup",
  "/api/system/machine-id",
]);

const PUBLIC_PREFIXES = ["/v1", "/v1beta", "/api/v1", "/api/v1beta", "/codex", "/responses"];

const ALWAYS_PROTECTED = new Set([
  "/api/shutdown",
  "/api/settings/database",
  "/api/version/shutdown",
  "/api/version/update",
  "/api/oauth/cursor/auto-import",
  "/api/oauth/kiro/auto-import",
]);

const LOCAL_ONLY_PATHS = [
  "/api/cli-tools/cowork-settings",
  "/api/oauth/cursor/auto-import",
  "/api/oauth/kiro/auto-import",
  "/api/auth/reset-password",
];

function isPublicLlmApi(pathname) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isPublicApi(pathname) {
  if (isPublicLlmApi(pathname)) return true;
  if (PUBLIC_API_PATHS.has(pathname)) return true;
  for (const p of PUBLIC_API_PATHS) {
    if (pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

function extractApiKey(c) {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const apiKey = c.req.header("x-api-key") || c.req.header("x-goog-api-key");
  if (apiKey) return apiKey.trim();
  try {
    const url = new URL(c.req.url);
    return url.searchParams.get("key") || null;
  } catch {
    return null;
  }
}

async function canAccessPublicLlmApi(c) {
  const peer = c.env?.incoming?.socket?.remoteAddress || "";
  if (peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1") return true;

  const cliToken = c.req.header(CLI_TOKEN_HEADER);
  if (cliToken && cliToken === (await getCliToken())) return true;

  const apiKey = extractApiKey(c);
  if (!apiKey) return false;
  const { validateApiKey } = await import("@/lib/localDb");
  return Boolean(await validateApiKey(apiKey));
}

// ── Dashboard Guard Middleware ────────────────────────────────────────────────
app.use("*", async (c, next) => {
  const pathname = c.req.path;

  // Allow public static assets
  if (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/providers/") ||
    pathname === "/favicon.svg" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    /\.(js|css|svg|png|jpg|jpeg|webp|ico|woff2?|ttf|eot)$/i.test(pathname)
  ) {
    return next();
  }

  // Public frontend pages
  if (pathname === "/login") {
    const authCookie = c.req.header("cookie");
    const tokenMatch = authCookie && authCookie.match(/auth_token=([^;]+)/);
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    if (token) {
      const { verifyDashboardAuthToken } = await import("@/lib/auth/dashboardSession");
      if (await verifyDashboardAuthToken(token)) {
        return c.redirect("/dashboard", 302);
      }
    }
    return next();
  }

  if (pathname === "/landing" || pathname.startsWith("/callback")) {
    return next();
  }

  // Protect all dashboard routes & root
  if (pathname === "/" || pathname.startsWith("/dashboard")) {
    const settings = await getCachedSettings();
    const requireLogin = settings?.requireLogin !== false;
    if (requireLogin) {
      const authCookie = c.req.header("cookie");
      const tokenMatch = authCookie && authCookie.match(/auth_token=([^;]+)/);
      const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
      let authenticated = false;
      if (token) {
        const { verifyDashboardAuthToken } = await import("@/lib/auth/dashboardSession");
        authenticated = await verifyDashboardAuthToken(token);
      }
      if (!authenticated) {
        return c.redirect("/login", 302);
      }
    }
    if (pathname === "/") {
      return c.redirect("/dashboard", 302);
    }
    return next();
  }

  // Local-only paths
  if (LOCAL_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
    const peer = c.env?.incoming?.socket?.remoteAddress || "";
    const isLoopback = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
    const cliToken = c.req.header(CLI_TOKEN_HEADER);
    const validCli = cliToken && cliToken === (await getCliToken());
    if (!isLoopback && !validCli) {
      return c.json({ error: "Local only: CLI token required" }, 403);
    }
  }

  // Always protected
  if (ALWAYS_PROTECTED.has(pathname)) {
    const cliToken = c.req.header(CLI_TOKEN_HEADER);
    if (cliToken && cliToken === (await getCliToken())) return next();

    const authCookie = c.req.header("cookie");
    const tokenMatch = authCookie && authCookie.match(/auth_token=([^;]+)/);
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    if (token) {
      const { verifyDashboardAuthToken } = await import("@/lib/auth/dashboardSession");
      if (await verifyDashboardAuthToken(token)) return next();
    }
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Public LLM API
  if (isPublicLlmApi(pathname)) {
    if (await canAccessPublicLlmApi(c)) return next();
    return c.json({ error: "API key required for remote API access" }, 401);
  }

  // /api/*
  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) return next();

    const cliToken = c.req.header(CLI_TOKEN_HEADER);
    if (cliToken && cliToken === (await getCliToken())) return next();

    const settings = await getCachedSettings();
    if (settings && settings.requireLogin === false) return next();

    const authCookie = c.req.header("cookie");
    const tokenMatch = authCookie && authCookie.match(/auth_token=([^;]+)/);
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    if (token) {
      const { verifyDashboardAuthToken } = await import("@/lib/auth/dashboardSession");
      if (await verifyDashboardAuthToken(token)) {
        // CSRF double-submit: require x-csrf-token echoing the csrf_token cookie
        // for state-changing browser-initiated mutations. CLI token bypass already
        // returned above, so we only reach here with a session cookie.
        const method = c.req.method;
        if (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH") {
          const csrfCookieMatch = authCookie?.match(/(?:^|;\s*)csrf_token=([^;]*)/);
          const csrfCookie = csrfCookieMatch ? decodeURIComponent(csrfCookieMatch[1]) : null;
          const csrfHeader = c.req.header("x-csrf-token");
          if (csrfCookie && csrfHeader) {
            const { validateCsrfToken } = await import("@/lib/security/ingressSecurity.js");
            if (!validateCsrfToken(csrfCookie, csrfHeader)) {
              return c.json({ error: "CSRF validation failed" }, 403);
            }
          }
        }
        return next();
      }
    }
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});

// ── Rewrites for /v1/* -> /api/v1/* ──────────────────────────────────────────
const chatHandler = async (c) => {
  const { handleChat } = await import("@/sse/handlers/chat.js");
  const { runWithRequestContext } = await import("@/lib/http/headers.js");
  return runWithRequestContext(c.req.raw, () => handleChat(c.req.raw));
};

app.all("/v1/chat/completions", chatHandler);
app.all("/v1/messages", chatHandler);
app.all("/v1/responses", chatHandler);
app.all("/v1/api/chat", chatHandler);
app.all("/codex/*", chatHandler);
app.all("/responses", chatHandler);

// ── General rewrites for /v1/* and /v1beta/* -> /api/v1/* ─────────────────────
const rewriteToApi = async (c) => {
  let targetPath = c.req.path;
  if (targetPath.startsWith("/v1/")) targetPath = targetPath.replace(/^\/v1\//, "/api/v1/");
  else if (targetPath === "/v1") targetPath = "/api/v1";
  else if (targetPath.startsWith("/v1beta/")) targetPath = targetPath.replace(/^\/v1beta\//, "/api/v1beta/");
  else if (targetPath === "/v1beta") targetPath = "/api/v1beta";

  const url = new URL(c.req.url);
  url.pathname = targetPath;
  const newReq = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
    duplex: "half",
  });
  return app.fetch(newReq, c.env);
};

app.all("/v1", rewriteToApi);
app.all("/v1/*", rewriteToApi);
app.all("/v1beta", rewriteToApi);
app.all("/v1beta/*", rewriteToApi);
app.get("/metrics", async (c) => {
  const { renderPrometheusMetrics } = await import("@/lib/observability/prometheusMetrics.js");
  const text = await renderPrometheusMetrics();
  return c.text(text, 200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
});
// ── Load 141 filesystem routes from src/app/api ──────────────────────────────
console.log("[WebServer] Loading API routes from src/app/api...");
const loadedRoutes = await loadApiRoutes(app);
console.log(`[WebServer] Successfully loaded ${loadedRoutes.length} route handlers.`);

// ── Serve Static Assets & SPA Fallback ────────────────────────────────────────
if (fs.existsSync(DIST_DIR)) {
  console.log(`[WebServer] Serving SPA assets from ${DIST_DIR}`);
  // High-performance caching for hashed assets (1 year immutable cache)
  app.use("/assets/*", async (c, next) => {
    await next();
    c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("/*", serveStatic({ root: "./dist" }));
  // SPA fallback: any non-API route returns dist/index.html
  app.get("*", (c) => {
    const p = c.req.path;
    if (p.startsWith("/api/") || p.startsWith("/v1") || p.startsWith("/v1beta") || p.startsWith("/codex")) {
      return c.json({ error: { message: "Not found", type: "invalid_request_error" } }, 404);
    }
    const indexPath = path.join(DIST_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      return c.html(fs.readFileSync(indexPath, "utf8"));
    }
    return c.text("AxonRouter SPA: run `npm run build` to generate dist/index.html", 404);
  });
} else {
  console.warn(`[WebServer] WARNING: ${DIST_DIR} not found. Run 'npm run build' first.`);
  app.get("/", (c) => c.text("AxonRouter: Run `npm run build` to build the dashboard SPA.", 200));
}

// ── Background Services & Watchdogs ──────────────────────────────────────────
async function initBackgroundServices() {
  try {
    const { initConsoleLogCapture } = await import("@/lib/consoleLogBuffer");
    initConsoleLogCapture();
  } catch (e) {
    console.error("[WebServer] console log capture init failed:", e.message);
  }

  try {
    const { ensureOutboundProxyInitialized } = await import("@/lib/network/initOutboundProxy");
    await ensureOutboundProxyInitialized();
  } catch (e) {
    console.error("[WebServer] outbound proxy init failed:", e.message);
  }

  try {
    const { installCatalogSource } = await import("open-sse/providers/catalogOverride.js");
    await installCatalogSource();
  } catch (e) {
    console.error("[WebServer] catalog source install failed:", e.message);
  }

  try {
    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();
  } catch (e) {
    console.error("[WebServer] catalog sync start failed:", e.message);
  }

  try {
    const { startBackgroundRefresh } = await import("@/domain/quotaCache.js");
    startBackgroundRefresh();
  } catch (e) {
    console.error("[WebServer] quota cache start failed:", e.message);
  }

  try {
    const { startBackgroundTokenRefresh } = await import("@/sse/services/backgroundTokenRefresh.js");
    startBackgroundTokenRefresh();
  } catch (e) {
    console.error("[WebServer] token refresh start failed:", e.message);
  }

  try {
    const { initTranslators } = await import("open-sse/translator/index.js");
    await initTranslators();
  } catch (e) {
    console.error("[WebServer] translator init failed:", e.message);
  }
}

// ── Start HTTP Server (Node.js & Bun compatible) ─────────────────────────────
if (typeof Bun !== "undefined") {
  console.log(`[WebServer] AxonRouter Hono Server running on Bun engine (http://${HOSTNAME}:${PORT})`);
  initBackgroundServices().catch((err) => console.error("[WebServer] Background services error:", err));
} else {
  serve(
    {
      fetch: app.fetch,
      port: PORT,
      hostname: HOSTNAME,
    },
    (info) => {
      console.log(`[WebServer] AxonRouter Hono Server listening on http://${info.address}:${info.port}`);
      initBackgroundServices().catch((err) => console.error("[WebServer] Background services error:", err));
    }
  );
}

// Graceful shutdown with in-flight drain
let shuttingDown = false;
async function handleGracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[WebServer] Received ${signal}. Draining in-flight requests...`);
  try {
    const { drainAndShutdown } = await import("@/lib/server/gracefulDrain.js");
    await drainAndShutdown(15000);
  } catch (err) {
    console.error("[WebServer] Error during drain:", err);
  }
  process.exit(0);
}
process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
export default typeof Bun !== "undefined"
  ? { port: PORT, hostname: HOSTNAME, fetch: app.fetch }
  : app;

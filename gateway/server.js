#!/usr/bin/env node
/**
 * axonrouter API Gateway — Hono + @hono/node-server, framework-free.
 *
 * Serves the public LLM API (/v1/*, /v1beta/*, /codex, /responses) in a
 * SEPARATE process from the dashboard (src/server/webServer.mjs) so gateway
 * traffic never contends with the dashboard's event loop.
 *
 * The chat pipeline (src/sse/handlers/*, open-sse/*) is 100% web-standard
 * Request/Response — Hono passes c.req.raw straight into handleChat().
 *
 * Cluster mode: one worker per CPU (capped) via node:cluster. Each worker
 * runs an independent Hono server; the OS load-balances accepted sockets.
 */

import { register } from "node:module";
register("./alias-resolver.mjs", import.meta.url);

import http from "node:http";
import cluster from "node:cluster";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { serve } from "@hono/node-server";
import { resolveGatewayMode } from "./workerMode.mjs";
import { renderGatewayLandingHtml } from "./landingPage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ── Config ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.GATEWAY_PORT || process.env.PORT || 3778);
// Worker topology toggle lives in workerMode.mjs (pure + unit-tested):
//   GATEWAY_CLUSTER=false|0|off|no → standalone single process (lowest RAM)
//   GATEWAY_WORKERS=<n>            → cluster worker count (default: CPU cores)
const { useCluster: USE_CLUSTER, workers: WORKERS, cores: CORES, mode: MODE } =
  resolveGatewayMode();

// ── Auth gate (ported from src/dashboardGuard.js public-API section) ─────────
// Public paths: LLM API carries its own key auth inside handlers; everything
// else under /v1 requires a valid dashboard API key (same rules as the Next
// middleware so behavior stays identical).
const PUBLIC_LLM_PREFIXES = ["/v1", "/v1beta", "/api/v1", "/api/v1beta", "/codex", "/responses"];

// In-process CLI token (same derivation as dashboardGuard: machine-id + salt)
let cliToken = null;
async function getCliToken() {
  if (cliToken) return cliToken;
  const mod = await import("@/shared/utils/machineId.js");
  cliToken = await mod.getConsistentMachineId("9r-cli-auth");
  return cliToken;
}

function extractApiKey(c) {
  const auth = c.req.header("Authorization") || c.req.raw.headers.get("authorization");
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
  const apiKey = extractApiKey(c);
  if (!apiKey) return false;
  const { validateApiKey } = await import("@/lib/db/repos/apiKeysRepo.js");
  return Boolean(await validateApiKey(apiKey));
}
// Rate limiting lives in gateway/rateLimit.js so the counter semantics can be tested;
// see that file for why the shared store is required. What remains here is the wiring:
// one shared counter for every worker, failing open, and a loud log the first time the
// shared store is unavailable, because the fallback inside incrSharedCounter restores
// the per-process counting this replaced without the request path being able to tell.
const { isRateLimited: checkRateLimit } = await import("./rateLimit.js");
let warnedSharedRateLimiter = false;

async function isRateLimited(ip) {
  const cache = await import("@/lib/cache/client.js");
  return checkRateLimit(ip, {
    incr: cache.incrSharedCounter,
    sharedAvailable: cache.isCacheAvailable,
    onDegrade: () => {
      if (warnedSharedRateLimiter) return;
      warnedSharedRateLimiter = true;
      console.error(
        "[rateLimit] shared store unavailable: counting per worker, so the effective limit is " +
          `${300 * WORKERS}/min not 300/min`
      );
    },
  });
}

// The auto-fetcher replaces each proxy group's whole pool set. This poll ran in every
// worker, so the "is anything due?" query went out WORKERS times per tick — 24 a
// minute on this deployment — to serve work that actually happens 6 times per 10
// minutes. The lock is what fixes that: one worker polls, the other eleven return
// immediately.
//
// The 60s cadence itself is deliberate and unchanged. The fastest group interval is
// 300s, and polling at 300s would let a group that becomes due wait up to another
// 300s, making the effective interval twice what the group asked for. 60s bounds that
// slip to a fifth of the interval, which is a good trade for one cheap query a minute.
//
// The lock is belt-and-braces rather than the primary guard: runProxyAutoFetcher
// already claims work in the database (last_fetched_at + fetch_interval_ms < NOW()),
// and measurement confirmed that prevents duplicate fetches. But that claim only holds
// if no two workers read the same due group before either writes, and nothing
// enforced that. proxyHealthSweep below uses acquireLock for exactly this reason.
//
// The lock TTL has to outlast a fetcher pass, which fetches a thousand pools per group
// and has been observed taking well over 30s. If it expires mid-pass the next worker
// starts a second one.
const AUTO_FETCH_POLL_MS = 60 * 1000;
const AUTO_FETCH_LOCK_KEY = "proxy:autoFetch:tick";
const AUTO_FETCH_LOCK_TTL_S = 180;

async function tickProxyAutoFetcher() {
  let token = null;
  // Captured outside the try so the finally can always release. Re-importing it there
  // would leave releaseLock undefined if that import failed, and the optional call
  // would swallow the miss — leaking the lock for its full TTL with nothing logged.
  let acquireLock = null;
  let releaseLock = null;
  try {
    ({ acquireLock, releaseLock } = await import("@/lib/cache/client.js"));
    token = await acquireLock(AUTO_FETCH_LOCK_KEY, AUTO_FETCH_LOCK_TTL_S).catch(() => null);
    if (!token) return; // another worker is on it
    const { runProxyAutoFetcher } = await import("../open-sse/services/proxyAutoFetcher.js");
    await runProxyAutoFetcher();
  } catch (err) {
    console.error("[proxyAutoFetcher] error:", err);
  } finally {
    if (token && releaseLock) {
      try {
        await releaseLock(AUTO_FETCH_LOCK_KEY, token);
      } catch (err) {
        // The lock expires on its own after AUTO_FETCH_LOCK_TTL_S, so this costs a
        // few skipped polls rather than a stuck fetcher.
        console.error("[proxyAutoFetcher] lock release failed:", err);
      }
    }
  }
}

setInterval(tickProxyAutoFetcher, AUTO_FETCH_POLL_MS).unref?.();

// Proxy health sweep, next to the fetcher that makes it necessary. The fetcher above
// replaces each proxy group's whole pool set (every 15 minutes as configured on the
// live groups) and roughly a quarter of what those Bright Data feeds return is
// unusable (isp_proxy1, isp_shared1 and unblocker1 measured 0/24 answering). The pool
// picker cannot react to that on its own: it round-robins, and the existing runtime
// counters in lib/network/proxyHealth.js need three consecutive failures on the same
// pool, which a set of ~2700 pools rotating can never produce.
//
// This probes a bounded slice per pass and records the verdict in
// proxy_pools.test_status, which the picker prefers. It never deactivates a pool —
// that would fight the fetcher and could empty a group on a transient blip.
//
// Scheduled here rather than in shared/services/initializeApp.js because that file
// is reached through bootstrap.js, which nothing imports: the auto-fetcher and
// state sweeper scheduled there have never actually run. The writes are read by the
// web/api process through the same database (its pool cache TTL is 5s), so one
// sweeper covers every process.
setTimeout(async () => {
  try {
    const { startProxyHealthSweep } = await import("../src/lib/network/proxyHealthSweep.js");
    startProxyHealthSweep();
  } catch (err) {
    console.error("[proxyHealthSweep] start error:", err);
  }
}, 90 * 1000).unref?.();

async function requireLlmAccess(c, next) {
  const pathname = c.req.path;
  if (!PUBLIC_LLM_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return next();

  // Loopback (same-host, direct socket) passes without a key — parity with
  // dashboardGuard isLocalRequest(). The gateway container always sees the
  // docker bridge IP as the peer, so remote clients need a key.
  const peer = c.env?.incoming?.socket?.remoteAddress || "";
  if (peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1") return next();

  if (await isRateLimited(peer)) {
    return c.json({ error: "Too many requests. Please slow down." }, 429);
  }
  if (c.req.header("x-axonrouter-cli-token")) {
    if (c.req.header("x-axonrouter-cli-token") === (await getCliToken())) return next();
  }
  if (await canAccessPublicLlmApi(c)) return next();
  return c.json({ error: "API key required for remote API access" }, 401);
}

// ── Handlers (imported from the existing pipeline — untouched) ───────────────
const srcSse = "@/sse/handlers";
let pipelineInitialized = false;
/**
 * Point this process's log files at a per-worker directory and start capturing.
 *
 * The gateway runs as a cluster (GATEWAY_WORKERS, set in .env; the compose default
 * is CPU cores). Every worker handles requests, so every worker emits
 * request-lifecycle lines and background refresh lines — but they are separate
 * processes with separate buffers. Sharing one file would interleave flushes and hand
 * a single rotation to every writer. Tagging the directory per worker keeps each
 * process the sole writer of its own console.log / request.log / background.log.
 *
 * Set CONSOLE_LOG_CAPTURE=false to keep gateway output on stdout only.
 */
async function initGatewayLogCapture() {
  if (process.env.CONSOLE_LOG_CAPTURE === "false") return;
  try {
    const workerTag = cluster.isWorker ? `w${cluster.worker.id}` : "primary";
    const baseDir = path.join(process.env.DATA_DIR || "/app/data", "logs", "gateway", workerTag);
    // Both are read by consoleLogBuffer: CONSOLE_LOG_FILE for the combined stream,
    // CONSOLE_LOG_DIR for the per-channel files.
    process.env.CONSOLE_LOG_DIR = baseDir;
    process.env.CONSOLE_LOG_FILE = path.join(baseDir, "console.log");
    const { initConsoleLogCapture } = await import("@/lib/consoleLogBuffer.js");
    initConsoleLogCapture();
  } catch (e) {
    // Logging must never keep the gateway from serving.
    console.warn("[Gateway] Console log capture unavailable:", e?.message || e);
  }
}

async function ensureInitialized() {
  if (pipelineInitialized) return;
  await initGatewayLogCapture();
  try {
    const { initValkey } = await import("@/lib/cache/valkeyClient.js");
    await initValkey();
  } catch (e) {
    console.warn("[Gateway] Valkey init failed:", e.message);
  }
  const { initTranslators } = await import("open-sse/translator/index.js");
  await initTranslators();
  pipelineInitialized = true;
}

function cors(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    ...extra,
  };
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = new Hono();

// gzip/deflate for compressible JSON bodies (e.g. /v1/models ~396KB → ~35KB).
// SSE (text/event-stream) and sub-1KB responses are excluded by hono/compress.
app.use("*", compress());

// Global CORS preflight for every route
app.options("*", (c) => c.body(null, 204, { headers: cors() }));
app.use("*", requireLlmAccess);

// ── Chat (OpenAI + Anthropic + Responses — all via handleChat, auto-detected
//    by detectFormatByEndpoint from the URL path + body shape) ────────────────
const chatHandler = async (c) => {
  await ensureInitialized();
  return handleChatProxy(c);
};
async function handleChatProxy(c) {
  const { handleChat } = await import(`${srcSse}/chat.js`);
  // c.req.raw IS the web-standard Request — pipeline consumes it natively.
  return handleChat(c.req.raw);
}

app.post("/v1/chat/completions", chatHandler);
app.post("/v1/messages", chatHandler);            // Anthropic protocol
app.post("/v1/messages/count_tokens", async (c) => {
  // Ported inline handler (framework-free estimate; kept byte-identical logic)
  const mod = await import("./shims/countTokens.js");
  return mod.countTokens(c.req.raw);
});
app.post("/v1/responses", chatHandler);
app.post("/v1/responses/compact", async (c) => {
  await ensureInitialized();
  const body = await c.req.json();
  body._compact = true;
  const { handleChat } = await import(`${srcSse}/chat.js`);
  const req = new Request(c.req.url, { method: "POST", headers: c.req.raw.headers, body: JSON.stringify(body) });
  return handleChat(req);
});
app.post("/v1/api/chat", chatHandler);            // Ollama-compat

// ── Models ────────────────────────────────────────────────────────────────────
const modelsHandler = async (c) => {
  await ensureInitialized();
  const mod = await import("@/app/api/v1/models/route.js");
  return mod.GET(c.req.raw);
};
app.get("/v1/models", modelsHandler);
app.get("/models", modelsHandler);
app.get("/v1/models/info", async (c) => {
  const mod = await import("@/app/api/v1/models/info/route.js");
  return mod.GET(c.req.raw);
});
app.get("/v1/models/*", async (c) => {
  const mod = await import("@/app/api/v1/models/[...model]/route.js");
  const kindPath = c.req.path.replace(/^\/v1\/models\/?/, "").split("/").filter(Boolean);
  // Next shim awaits params.model (string or array); pass the path segments.
  return mod.GET(c.req.raw, { params: Promise.resolve({ model: kindPath }) });
});

// ── Media / misc ──────────────────────────────────────────────────────────────
app.post("/v1/embeddings", async (c) => {
  await ensureInitialized();
  const { handleEmbeddings } = await import(`${srcSse}/embeddings.js`);
  return handleEmbeddings(c.req.raw);
});
app.post("/v1/images/generations", async (c) => {
  await ensureInitialized();
  const { handleImageGeneration } = await import(`${srcSse}/imageGeneration.js`);
  return handleImageGeneration(c.req.raw);
});
app.post("/v1/audio/speech", async (c) => {
  await ensureInitialized();
  const { handleTts } = await import(`${srcSse}/tts.js`);
  return handleTts(c.req.raw);
});
app.post("/v1/audio/transcriptions", async (c) => {
  await ensureInitialized();
  const { handleStt } = await import(`${srcSse}/stt.js`);
  return handleStt(c.req.raw);
});
app.get("/v1/audio/voices", async (c) => {
  const mod = await import("@/app/api/v1/audio/voices/route.js");
  return mod.GET(c.req.raw);
});
app.post("/v1/videos/generations", async (c) => {
  await ensureInitialized();
  const { handleVideoCreate } = await import(`${srcSse}/videoGeneration.js`);
  return handleVideoCreate(c.req.raw, "generations");
});
app.post("/v1/videos/edits", async (c) => {
  const { handleVideoCreate } = await import(`${srcSse}/videoGeneration.js`);
  return handleVideoCreate(c.req.raw, "edits");
});
app.post("/v1/videos/extensions", async (c) => {
  const { handleVideoCreate } = await import(`${srcSse}/videoGeneration.js`);
  return handleVideoCreate(c.req.raw, "extensions");
});
app.get("/v1/videos/:id", async (c) => {
  const { handleVideoGet } = await import(`${srcSse}/videoGeneration.js`);
  return handleVideoGet(c.req.raw, c.req.param("id"));
});
app.get("/v1/videos/:id/content", async (c) => {
  const { handleVideoGet } = await import(`${srcSse}/videoGeneration.js`);
  return handleVideoGet(c.req.raw, c.req.param("id"), { content: true });
});
app.post("/v1/search", async (c) => {
  await ensureInitialized();
  const { handleSearch } = await import(`${srcSse}/search.js`);
  return handleSearch(c.req.raw);
});
app.post("/v1/web/fetch", async (c) => {
  await ensureInitialized();
  const { handleFetch } = await import(`${srcSse}/fetch.js`);
  return handleFetch(c.req.raw);
});
app.post("/v1/systemone", async (c) => {
  await ensureInitialized();
  const { handleSystemOne } = await import(`${srcSse}/systemone.js`);
  return handleSystemOne(c.req.raw);
});

// ── Root Landing Page (Informative Non-Generic UI for Browser Visitors) ───────
app.get("/", (c) => {
  const html = renderGatewayLandingHtml({ mode: MODE, workers: WORKERS, port: PORT });
  return c.html(html, 200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
});
// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", async (c) => {
  try {
    const { getProviderConnections } = await import("@/lib/db/repos/connectionsRepo.js");
    await getProviderConnections({ isActive: true, limit: 1 });
    // Informational only: a down Valkey must never fail this check, because the
    // compose/watchtower healthcheck would restart a healthy worker. The app
    // fails open to per-process memory in that case.
    let valkey = false;
    try {
      const { isValkeyAvailable, valkeyPingLatencyMs } = await import("@/lib/cache/valkeyClient.js");
      valkey = isValkeyAvailable() && (await valkeyPingLatencyMs()) >= 0;
    } catch {}
    return c.json({
      status: "healthy",
      service: "gateway",
      mode: MODE,
      workers: WORKERS,
      pid: process.pid,
      valkey,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return c.json({ status: "degraded", error: e.message, timestamp: new Date().toISOString() }, 503);
  }
});

// ── Prometheus Metrics ────────────────────────────────────────────────────────
app.get("/metrics", async (c) => {
  const { renderPrometheusMetrics } = await import("@/lib/observability/prometheusMetrics.js");
  const text = await renderPrometheusMetrics();
  return c.text(text, 200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
});

// 404 for unknown /v1 paths
app.notFound((c) => c.json({ error: { message: "Not found", type: "invalid_request_error" } }, 404));

// ── Server timeouts: a hung upstream (free-tier queue) must not pin a socket
// forever. keepAliveTimeout/headersTimeout guard idle keepalive clients;
// requestTimeout bounds a slow chat completion so one stuck upstream cannot
// hold a worker hostage; maxRequestsPerSocket=0 keeps agent sockets recyclable.
const SERVER_TIMEOUTS = {
  keepAliveTimeout: 75_000,
  headersTimeout: 80_000,
  requestTimeout: 300_000,
  maxRequestsPerSocket: 0,
};
function startWorkerServer() {
  // Timeouts come from SERVER_TIMEOUTS: a stalled upstream (free-tier queue,
  // dead proxy) must not hold a worker socket forever. requestTimeout is the
  // hard ceiling for any single request incl. streaming chat completions.
  const server = serve({ fetch: app.fetch, port: PORT, hostname: process.env.HOSTNAME || "0.0.0.0" });
  server.keepAliveTimeout = SERVER_TIMEOUTS.keepAliveTimeout;   // > LB idle (default 65s) — avoids reset storms
  server.headersTimeout = SERVER_TIMEOUTS.headersTimeout;
  server.requestTimeout = SERVER_TIMEOUTS.requestTimeout;       // 5 min ceiling per request
  server.maxRequestsPerSocket = SERVER_TIMEOUTS.maxRequestsPerSocket; // unlimited reuse
  // Streaming/SSE in flight when requestTimeout fires would be destroyed with
  // ECONNRESET; listen for it so we log the killed request instead of a crash.
  server.on("clientError", (err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });
  const modeLabel = USE_CLUSTER ? `worker ${process.pid} of ${WORKERS}` : `standalone pid ${process.pid} (cluster disabled)`;
  console.log(`[Gateway] mode=${MODE} listening on ${PORT} (node ${process.version}) — ${modeLabel}`);
  // Pipeline warm-up in the background so the first client request is fast.
  ensureInitialized().catch(() => {});
  // Models snapshot is shared via PostgreSQL (src/lib/cache/modelsSnapshot.js):
  // the first worker warms the row, the rest read it. One build cluster-wide.
  setTimeout(async () => {
    try {
      const mod = await import("@/app/api/v1/models/route.js");
      await mod.GET(new Request("http://127.0.0.1/v1/models"));
    } catch { /* best-effort warm */ }
  }, 1500).unref?.();

  // Graceful drain: stop accepting new sockets, let in-flight SSE streams
  // finish (agent traffic must not be cut mid-response), then exit.
  let workerShuttingDown = false;
  const workerShutdown = (signal) => {
    if (workerShuttingDown) return;
    workerShuttingDown = true;
    console.log(`[Gateway] ${modeLabel} received ${signal} — draining`);
    const deadline = setTimeout(() => {
      console.warn(`[Gateway] ${modeLabel} drain timed out — forcing exit`);
      process.exit(0);
    }, 15_000);
    deadline.unref?.();
    server.close(() => {
      console.log(`[Gateway] ${modeLabel} drained — exiting`);
      process.exit(0);
    });
    // Idle keep-alive sockets would hold close(); drop them so close() fires.
    if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
  };
  process.on("SIGINT", () => workerShutdown("SIGINT"));
  process.on("SIGTERM", () => workerShutdown("SIGTERM"));
}

if (USE_CLUSTER && cluster.isPrimary) {
  // Primary only orchestrates — it must NOT bind the port (workers do).
  console.log(`[Gateway] primary ${process.pid} forking ${WORKERS} worker(s) (cluster mode enabled)`);
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  let shuttingDown = false;
  cluster.on("exit", (worker, code, signal) => {
    if (shuttingDown) return;
    console.error(`[Gateway] worker ${worker.process.pid} died (${signal || code}) — respawning`);
    cluster.fork();
  });
  const primaryShutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Gateway] primary received ${signal} — signaling workers to drain`);
    for (const id in cluster.workers) cluster.workers[id].process.kill(signal);
    setTimeout(() => process.exit(0), 16_000).unref?.();
  };
  process.on("SIGINT", () => primaryShutdown("SIGINT"));
  process.on("SIGTERM", () => primaryShutdown("SIGTERM"));
} else {
  startWorkerServer();
}

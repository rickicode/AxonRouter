import { Readable } from "stream";
import { MEMORY_CONFIG } from "../config/runtimeConfig";

const isCloud = typeof caches !== "undefined" && typeof caches === "object";

const originalFetch = globalThis.fetch;
const proxyDispatchers = new Map();

// DNS cache — use Map to avoid prototype pollution via malformed hostnames
const DNS_CACHE = new Map();
const MITM_BYPASS_HOSTS = [
  "cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.googleapis.com",
  "api.individual.githubcopilot.com",
  "q.us-east-1.amazonaws.com",
  "codewhisperer.us-east-1.amazonaws.com",
  "api2.cursor.sh",
];
const ANTHROPIC_HOST = "api.anthropic.com";
const GOOGLE_DNS_SERVERS = ["8.8.8.8", "8.8.4.4"];
const HTTPS_PORT = 443;
const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 300;

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function getErrorCode(error) {
  return error?.cause?.code || error?.code || "";
}

function formatDiagnosticError(prefix, error, extra: any = {}) {
  const details = [];
  const code = getErrorCode(error);
  const phase = normalizeString(extra.phase);
  const targetUrl = normalizeString(extra.targetUrl);
  const proxyUrl = normalizeString(extra.proxyUrl);
  const baseMessage = error?.message || String(error);

  if (phase) details.push(`phase=${phase}`);
  if (code) details.push(`code=${code}`);
  if (proxyUrl) details.push(`proxy=${proxyUrl}`);
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      details.push(`host=${parsed.hostname}`);
    } catch {}
  }

  const message = `${prefix}: ${baseMessage}${details.length > 0 ? ` [${details.join(" ")}]` : ""}`;
  const diagnostic: any = new Error(message);
  diagnostic.cause = error;
  if (code) diagnostic.code = code;
  if (phase) diagnostic.phase = phase;
  if (targetUrl) diagnostic.targetUrl = targetUrl;
  if (proxyUrl) diagnostic.proxyUrl = proxyUrl;
  if (code === "UPSTREAM_TIMEOUT" || code === "STREAM_IDLE_TIMEOUT") {
    diagnostic.name = "AbortError";
    diagnostic.timeoutMs = error?.timeoutMs ?? error?.cause?.timeoutMs ?? null;
  }
  return diagnostic;
}

/**
 * Resolve real IP using Google DNS (bypass system DNS)
 */
async function resolveRealIP(hostname) {
  const cached = DNS_CACHE.get(hostname);
  if (cached && Date.now() < cached.expiry) return cached.ip;

  try {
    const dns = await import("dns");
    const { promisify } = await import("util");
    const resolver = new dns.Resolver();
    resolver.setServers(GOOGLE_DNS_SERVERS);
    const resolve4 = promisify(resolver.resolve4.bind(resolver));
    const addresses = await resolve4(hostname);
    DNS_CACHE.set(hostname, { ip: addresses[0], expiry: Date.now() + MEMORY_CONFIG.dnsCacheTtlMs });
    return addresses[0];
  } catch (error) {
    console.warn(`[ProxyFetch] DNS resolve failed for ${hostname}:`, error.message);
    return null;
  }
}

/**
 * Check if MITM server is actually running (PID file exists and process alive)
 */
let mitmRunningCache: { value: boolean; expiry: number } | null = null;
const MITM_CHECK_INTERVAL_MS = 10_000;

function isMitmServerRunning(): boolean {
  if (mitmRunningCache && Date.now() < mitmRunningCache.expiry) return mitmRunningCache.value;
  let running = false;
  try {
    const fs = require("fs");
    const path = require("path");
    const os = require("os");
    const pidFile = path.join(os.homedir(), ".axonrouter", "mitm", ".mitm.pid");
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
      if (pid > 0) {
        process.kill(pid, 0); // throws if not alive
        running = true;
      }
    }
  } catch { /* not running */ }
  mitmRunningCache = { value: running, expiry: Date.now() + MITM_CHECK_INTERVAL_MS };
  return running;
}

/**
 * Check if request should bypass MITM DNS redirect
 * Only active when MITM server is actually running
 */
function shouldBypassMitmDns(url) {
  if (!isMitmServerRunning()) return false;
  try {
    const hostname = new URL(url).hostname;
    return MITM_BYPASS_HOSTS.some(host => hostname.includes(host));
  } catch { return false; }
}

function shouldBypassByNoProxy(targetUrl, noProxyValue) {
  const noProxy = normalizeString(noProxyValue);
  if (!noProxy) return false;

  let hostname;
  try { hostname = new URL(targetUrl).hostname.toLowerCase(); } catch { return false; }
  const patterns = noProxy.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);

  return patterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.startsWith(".")) return hostname.endsWith(pattern) || hostname === pattern.slice(1);
    return hostname === pattern || hostname.endsWith(`.${pattern}`);
  });
}

/**
 * Get proxy URL from environment
 */
function getEnvProxyUrl(targetUrl) {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  if (shouldBypassByNoProxy(targetUrl, noProxy)) return null;

  let protocol;
  try { protocol = new URL(targetUrl).protocol; } catch { return null; }

  if (protocol === "https:") {
    return process.env.HTTPS_PROXY || process.env.https_proxy ||
      process.env.ALL_PROXY || process.env.all_proxy;
  }

  return process.env.HTTP_PROXY || process.env.http_proxy ||
    process.env.ALL_PROXY || process.env.all_proxy;
}

/**
 * Normalize proxy URL (allow host:port)
 */
function normalizeProxyUrl(proxyUrl) {
  const normalizedInput = normalizeString(proxyUrl);
  if (!normalizedInput) return null;

  try {

    new URL(normalizedInput);
    return normalizedInput;
  } catch {
    // Allow "127.0.0.1:7890" style values
    return `http://${normalizedInput}`;
  }
}

function resolveConnectionProxyUrl(targetUrl, proxyOptions) {
  const enabled = proxyOptions?.enabled === true || proxyOptions?.connectionProxyEnabled === true;
  if (!enabled) return null;

  const proxyUrlRaw = normalizeString(proxyOptions?.url ?? proxyOptions?.connectionProxyUrl);
  if (!proxyUrlRaw) return null;

  const noProxy = normalizeString(proxyOptions?.noProxy ?? proxyOptions?.connectionNoProxy);
  if (noProxy && shouldBypassByNoProxy(targetUrl, noProxy)) return null;

  return normalizeProxyUrl(proxyUrlRaw);
}

/**
 * Create proxy dispatcher lazily (undici-compatible)
 */
async function getDispatcher(proxyUrl) {
  const normalized = normalizeProxyUrl(proxyUrl);
  if (!normalized) return null;

  if (!proxyDispatchers.has(normalized)) {
    // Evict oldest entry if max size reached
    if (proxyDispatchers.size >= MEMORY_CONFIG.proxyDispatchersMaxSize) {
      proxyDispatchers.delete(proxyDispatchers.keys().next().value);
    }
    const { ProxyAgent } = await import("undici");
    proxyDispatchers.set(normalized, new ProxyAgent({ uri: normalized }));
  }

  return proxyDispatchers.get(normalized);
}

/**
 * Create HTTPS request with manual socket connection (bypass DNS)
 */
const BYPASS_TIMEOUT_MS = 15_000;

async function createBypassRequest(parsedUrl, realIP, options) {
  const httpsModule = await import("https");
  const netModule = await import("net");
  const https = httpsModule.default ?? httpsModule;
  const net = netModule.default ?? netModule;

  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = new net.Socket();

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`MITM bypass timeout after ${BYPASS_TIMEOUT_MS}ms to ${realIP}`));
    }, BYPASS_TIMEOUT_MS);

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };

    socket.on("error", fail);

    socket.connect(HTTPS_PORT, realIP, () => {
      const req = https.request({
        createConnection: () => socket,
        servername: parsedUrl.hostname,
        rejectUnauthorized: true,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || "POST",
        headers: { ...options.headers, Host: parsedUrl.hostname },
      } as any, (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const response = {
          ok: res.statusCode >= HTTP_SUCCESS_MIN && res.statusCode < HTTP_SUCCESS_MAX,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: new Map(Object.entries(res.headers)),
          body: Readable.toWeb(res),
          text: async () => {
            const chunks = [];
            for await (const chunk of res) chunks.push(chunk);
            return Buffer.concat(chunks).toString();
          },
          json: async () => JSON.parse(await response.text()),
        };
        resolve(response);
      });

      req.on("error", fail);
      if (options.body) {
        req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  });
}

async function createGotScrapingResponse(targetUrl, options) {
  const { gotScraping } = await import("got-scraping");
  const response = await gotScraping(targetUrl, {
    method: options.method || "GET",
    headers: options.headers,
    body: options.body,
    throwHttpErrors: false,
    responseType: "buffer",
  });

  const rawBody = response.rawBody ?? Buffer.alloc(0);
  return {
    ok: response.statusCode >= HTTP_SUCCESS_MIN && response.statusCode < HTTP_SUCCESS_MAX,
    status: response.statusCode,
    statusText: response.statusMessage,
    headers: new Map(Object.entries(response.headers || {})),
    body: Readable.toWeb(Readable.from([rawBody])),
    text: async () => rawBody.toString(),
    json: async () => JSON.parse(rawBody.toString() || "{}"),
  };
}

const RELAY_ERROR_STATUSES = new Set([403, 429, 502, 503, 504]);
const PROXY_ERROR_STATUSES = new Set([403, 407, 429, 502, 503, 504]);

function isRelayHtmlError(response: Response): boolean {
  const status = response.status;
  if (status >= 200 && status < 300) return false;
  if (!RELAY_ERROR_STATUSES.has(status) && status < 500) return false;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return false;
  if (contentType.includes("text/event-stream")) return false;
  if (contentType.includes("text/html")) return true;
  return false;
}

function isProxyHtmlError(response: Response): boolean {
  const status = response.status;
  if (status >= 200 && status < 300) return false;
  if (!PROXY_ERROR_STATUSES.has(status) && status < 500) return false;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return false;
  if (contentType.includes("text/event-stream")) return false;
  if (contentType.includes("text/html")) return true;
  return false;
}

export async function proxyAwareFetch(url, options: any = {}, proxyOptions: any = null) {
  const targetUrl = typeof url === "string" ? url : url.toString();
  const parsedTarget = new URL(targetUrl);
  const isAnthropicHost = parsedTarget.hostname === ANTHROPIC_HOST;
  const wantsStream = normalizeString(options.headers?.Accept || options.headers?.accept) === "text/event-stream";

  if (isAnthropicHost && !wantsStream) {
    try {
      return await createGotScrapingResponse(targetUrl, options);
    } catch (error) {
      console.warn(`[ProxyFetch] got-scraping failed, falling back to standard fetch: ${error.message}`);
    }
  }

  // Relay: forward request via relay headers
  const relayUrl = normalizeString(proxyOptions?.relayUrl ?? proxyOptions?.vercelRelayUrl);
  if (relayUrl) {
    // Check noProxy bypass before using relay
    const connectionNoProxy = normalizeString(proxyOptions?.noProxy ?? proxyOptions?.connectionNoProxy);
    if (connectionNoProxy && shouldBypassByNoProxy(targetUrl, connectionNoProxy)) {
      // noProxy match — bypass relay, go direct
      try {
        return await originalFetch(url, options);
      } catch (error) {
        throw formatDiagnosticError("Direct fetch failed (noProxy bypass)", error, {
          phase: "direct-noProxy",
          targetUrl,
        });
      }
    }

    const parsed = parsedTarget;
    const relayHeaders = {
      ...options.headers,
      "x-relay-target": `${parsed.protocol}//${parsed.host}`,
      "x-relay-path": `${parsed.pathname}${parsed.search}`,
    };
    try {
      const relayResponse = await originalFetch(relayUrl, { ...options, headers: relayHeaders });

      // Detect HTML error pages from relay (rate limits, Cloudflare blocks, nginx errors)
      if (isRelayHtmlError(relayResponse)) {
        console.warn(`[ProxyFetch] Relay returned HTML error (likely rate limit/block), status=${relayResponse.status}`);
        if (proxyOptions?.strictProxy === true) {
          throw formatDiagnosticError("Relay returned HTML error page", new Error(`HTTP ${relayResponse.status} with text/html`), {
            phase: "relay-html-error",
            targetUrl,
            proxyUrl: relayUrl,
          });
        }
        // Fall back to direct fetch
        try {
          return await originalFetch(url, options);
        } catch (directError) {
          throw formatDiagnosticError("Relay HTML error and direct fallback also failed", directError, {
            phase: "relay-html-fallback-direct",
            targetUrl,
            proxyUrl: relayUrl,
          });
        }
      }

      return relayResponse;
    } catch (relayError) {
      // Re-throw diagnostic errors from HTML detection above
      if (relayError instanceof Error && (relayError as any).phase) {
        throw relayError;
      }

      // If strictProxy is enabled, fail hard instead of falling back to direct.
      if (proxyOptions?.strictProxy === true) {
        throw formatDiagnosticError("Relay required but failed (strictProxy)", relayError, {
          phase: "relay-strict",
          targetUrl,
          proxyUrl: relayUrl,
        });
      }

      console.warn(`[ProxyFetch] Relay failed, falling back to direct: ${relayError.message}`);
      try {
        return await originalFetch(url, options);
      } catch (directError) {
        throw formatDiagnosticError("Relay failed and direct fallback also failed", directError, {
          phase: "relay-fallback-direct",
          targetUrl,
          proxyUrl: relayUrl,
        });
      }
    }
  }

  const connectionProxyUrl = resolveConnectionProxyUrl(targetUrl, proxyOptions);
  const envProxyUrl = connectionProxyUrl ? null : normalizeProxyUrl(getEnvProxyUrl(targetUrl));
  const proxyUrl = connectionProxyUrl || envProxyUrl;

  // MITM DNS bypass: for known MITM-intercepted hosts, resolve real IP to avoid DNS spoof
  if (shouldBypassMitmDns(targetUrl)) {
    if (proxyUrl) {
      // Proxy resolves DNS externally (not affected by /etc/hosts) — use proxy directly
      try {
        const dispatcher = await getDispatcher(proxyUrl);
        return await (originalFetch as any)(url, { ...options, dispatcher });
      } catch (proxyError) {
        if (proxyOptions?.strictProxy === true) {
          throw formatDiagnosticError("Proxy required but failed", proxyError, {
            phase: "proxy-strict-mitm-bypass",
            targetUrl,
            proxyUrl,
          });
        }
        console.warn(`[ProxyFetch] Proxy failed, falling back to direct bypass: ${proxyError.message}`);
      }
    }
    // No proxy — manually resolve real IP to bypass DNS spoof
    try {
      const parsedUrl = new URL(targetUrl);
      const realIP = await resolveRealIP(parsedUrl.hostname);
      if (realIP) return await createBypassRequest(parsedUrl, realIP, options);
    } catch (error) {
      console.warn(`[ProxyFetch] MITM bypass failed: ${error.message}`);
    }
  }

  if (proxyUrl) {
    try {
      const dispatcher = await getDispatcher(proxyUrl);
      const proxyResponse = await (originalFetch as any)(url, { ...options, dispatcher });

      // Detect HTML error pages from HTTP proxy
      if (isProxyHtmlError(proxyResponse)) {
        console.warn(`[ProxyFetch] HTTP proxy returned HTML error (likely rate limit/block), status=${proxyResponse.status}`);
        if (proxyOptions?.strictProxy === true) {
          throw formatDiagnosticError("HTTP proxy returned HTML error page", new Error(`HTTP ${proxyResponse.status} with text/html`), {
            phase: "proxy-html-error",
            targetUrl,
            proxyUrl,
          });
        }
        // Fall back to direct fetch
        try {
          return await originalFetch(url, options);
        } catch (directError) {
          throw formatDiagnosticError("Proxy HTML error and direct fallback also failed", directError, {
            phase: "proxy-html-fallback-direct",
            targetUrl,
            proxyUrl,
          });
        }
      }

      return proxyResponse;
    } catch (proxyError) {
      // Re-throw diagnostic errors from HTML detection above
      if (proxyError instanceof Error && (proxyError as any).phase) {
        throw proxyError;
      }

      // If strictProxy is enabled, fail hard instead of falling back to direct
      if (proxyOptions?.strictProxy === true) {
        throw formatDiagnosticError("Proxy required but failed", proxyError, {
          phase: "proxy-strict",
          targetUrl,
          proxyUrl,
        });
      }
      console.warn(`[ProxyFetch] Proxy failed, falling back to direct: ${proxyError.message}`);
      try {
        return await originalFetch(url, options);
      } catch (directError) {
        throw formatDiagnosticError("Proxy failed and direct fallback also failed", directError, {
          phase: "proxy-fallback-direct",
          targetUrl,
          proxyUrl,
        });
      }
    }
  }

  try {
    return await originalFetch(url, options);
  } catch (error) {
    throw formatDiagnosticError("Direct fetch failed", error, {
      phase: shouldBypassMitmDns(targetUrl) ? "direct-after-mitm-bypass" : "direct",
      targetUrl,
    });
  }
}

/**
 * Patched global fetch with env-proxy support and MITM DNS bypass
 */
async function patchedFetch(url, options: any = {}) {
  return proxyAwareFetch(url, options, null);
}

// Idempotency guard — only patch once to avoid wrapping multiple times
if (!isCloud && globalThis.fetch !== patchedFetch) {
  globalThis.fetch = patchedFetch;
}

export default isCloud ? originalFetch : patchedFetch;

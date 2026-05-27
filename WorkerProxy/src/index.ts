/**
 * AxonRouter Worker Relay Proxy
 *
 * Forwards requests to target specified in x-relay-target + x-relay-path headers.
 * Streams response back (supports SSE).
 *
 * Dual-runtime: works on Cloudflare Workers AND Node.js (VPS).
 */

// ── Headers that must be stripped before forwarding ────────────────────
const STRIP_HEADERS = new Set([
  "x-relay-target",
  "x-relay-path",
  "host",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "cf-cache-status",
  "x-forwarded-for",
  "x-forwarded-proto",
]);

// ── Blocklist: never forward to these hosts ────────────────────────────
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254", // cloud metadata
]);

// ── Helpers ───────────────────────────────────────────────────────────

function parseAllowedHosts(env: Record<string, unknown>): Set<string> | null {
  const raw = env.ALLOWED_HOSTS as string | undefined;
  if (!raw || !raw.trim()) return null;
  return new Set(raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
}

function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname)) return true;
  // Block anything that looks like a private IP
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) return true;
  return false;
}

function isAllowedHost(hostname: string, allowedHosts: Set<string> | null): boolean {
  if (!allowedHosts) return true; // no restriction
  return allowedHosts.has(hostname) || allowedHosts.has("*");
}

// ── Core handler (runtime-agnostic) ───────────────────────────────────

export async function handleRequest(request: Request, env: Record<string, unknown> = {}): Promise<Response> {
  const url = new URL(request.url);

  // ── Health check ──────────────────────────────────────────────────
  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok", service: "axon-relay-proxy" }), {
      headers: { "content-type": "application/json" },
    });
  }

  // ── Relay mode: x-relay-target header ─────────────────────────────
  const relayTarget = request.headers.get("x-relay-target");
  const relayPath = request.headers.get("x-relay-path") || "/";

  // Validate relayPath: must be a relative path starting with /
  const normalizedRelayPath = relayPath.startsWith("/") ? relayPath : `/${relayPath}`;

  // Block path traversal attempts: reject if relayPath contains protocol or authority
  if (normalizedRelayPath.includes("://") || normalizedRelayPath.startsWith("//")) {
    return new Response(JSON.stringify({ error: "Invalid x-relay-path: must be a relative path" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (relayTarget) {
    let targetUrl: URL;
    try {
      targetUrl = new URL(relayTarget);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid x-relay-target URL" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Security: only allow https://
    if (targetUrl.protocol !== "https:") {
      return new Response(JSON.stringify({ error: "Only https:// targets are allowed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Security: block private/local hosts
    if (isBlockedHost(targetUrl.hostname)) {
      return new Response(JSON.stringify({ error: "Target host is not allowed" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    // Security: optional host allowlist
    const allowedHosts = parseAllowedHosts(env);
    if (!isAllowedHost(targetUrl.hostname, allowedHosts)) {
      return new Response(JSON.stringify({ error: "Target host is not in allowed list" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    // Build final target URL
    const finalUrl = `${targetUrl.origin}${normalizedRelayPath}`;

    // Build forwarding headers — strip relay/internal headers
    const forwardHeaders = new Headers(request.headers);
    for (const key of STRIP_HEADERS) {
      forwardHeaders.delete(key);
    }

    // Forward request
    const init: RequestInit = {
      method: request.method,
      headers: forwardHeaders,
      redirect: "follow",
    };

    // Forward body for non-HEAD/GET requests
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      // @ts-expect-error duplex is needed for streaming body
      init.duplex = "half";
    }

    try {
      const upstream = await fetch(finalUrl, init);

      // Build response headers — strip hop-by-hop headers
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete("cf-ray");
      responseHeaders.delete("cf-cache-status");
      responseHeaders.delete("cf-worker");
      responseHeaders.delete("server");
      responseHeaders.delete("alt-svc"); // prevent h3 redirect back to CF

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: `Upstream fetch failed: ${message}` }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // ── Fallback: URL-rewrite mode (/go/https://target) ──────────────
  // Supports the existing proxy.hijilabs.workers.dev/go/ pattern
  const goPrefix = "/go/";
  if (url.pathname.startsWith(goPrefix)) {
    const targetStr = decodeURIComponent(url.pathname.slice(goPrefix.length));

    let targetUrl: URL;
    try {
      targetUrl = new URL(targetStr);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid target URL after /go/" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Security: only allow https://
    if (targetUrl.protocol !== "https:") {
      return new Response(JSON.stringify({ error: "Only https:// targets are allowed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (isBlockedHost(targetUrl.hostname)) {
      return new Response(JSON.stringify({ error: "Target host is not allowed" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    const allowedHosts = parseAllowedHosts(env);
    if (!isAllowedHost(targetUrl.hostname, allowedHosts)) {
      return new Response(JSON.stringify({ error: "Target host is not in allowed list" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    // Reconstruct full URL with query params
    const finalUrl = `${targetUrl.origin}${targetUrl.pathname}${url.search}`;

    const forwardHeaders = new Headers(request.headers);
    for (const key of STRIP_HEADERS) {
      forwardHeaders.delete(key);
    }

    const init: RequestInit = {
      method: request.method,
      headers: forwardHeaders,
      redirect: "follow",
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      // @ts-expect-error duplex is needed for streaming body
      init.duplex = "half";
    }

    try {
      const upstream = await fetch(finalUrl, init);

      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete("cf-ray");
      responseHeaders.delete("cf-cache-status");
      responseHeaders.delete("cf-worker");
      responseHeaders.delete("server");
      responseHeaders.delete("alt-svc");

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: `Upstream fetch failed: ${message}` }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // ── Root: info ────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      service: "axon-relay-proxy",
      usage: "Set x-relay-target + x-relay-path headers, or use /go/https://target URL",
    }),
    { headers: { "content-type": "application/json" } }
  );
}

// ── Cloudflare Workers export ──────────────────────────────────────────

const handler = {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    return handleRequest(request, env);
  },
};

export default handler;

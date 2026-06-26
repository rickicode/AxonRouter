import crypto from "crypto";

export const RELAY_TYPES = new Set(["vercel", "deno", "cloudflare"] as const);

export type RelayType = "vercel" | "deno" | "cloudflare";
export type ProxyPoolType = "http" | RelayType;
export const VALID_PROXY_TYPES: ProxyPoolType[] = ["http", "vercel", "deno", "cloudflare"];

export function isRelayType(type: string | undefined | null): type is RelayType {
  return RELAY_TYPES.has(type as RelayType);
}

export function detectRelayType(url: string): RelayType | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.endsWith(".vercel.app") || u.hostname.endsWith(".now.sh")) return "vercel";
    if (u.hostname.endsWith(".deno.net")) return "deno";
    if (u.hostname.endsWith(".workers.dev")) return "cloudflare";
  } catch {}
  return null;
}

export function normalizeProxyPoolType(value: unknown, proxyUrl?: string): ProxyPoolType {
  if (typeof value === "string" && RELAY_TYPES.has(value as RelayType)) return value as RelayType;
  if (proxyUrl) {
    const detected = detectRelayType(proxyUrl);
    if (detected) return detected;
  }
  return "http";
}

export function generateRelayAuth(): string {
  return crypto.randomBytes(24).toString("hex");
}

// SSRF guard: block private/internal hostnames
export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0") return true;
  if (h.startsWith("10.") || h.startsWith("192.168.")) return true;
  // 172.16-31.x.x
  const parts = h.split(".");
  if (parts[0] === "172") {
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  return false;
}

// Edge function source with auth + SSRF guard (shared by vercel/deno/cloudflare)
export function buildRelayEdgeFunctionSource(relayType: RelayType): string {
  if (relayType === "deno") {
    return `
Deno.serve(async (req) => {
  const auth = req.headers.get("x-relay-auth");
  const expected = Deno.env.get("RELAY_AUTH");
  if (expected && auth !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  const target = req.headers.get("x-relay-target");
  const relayPath = req.headers.get("x-relay-path") || "/";
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing x-relay-target header" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const targetUrl = new URL(target.replace(/\\/$/, "") + relayPath);
  if (["127.0.0.1","localhost","::1","0.0.0.0"].includes(targetUrl.hostname) || targetUrl.hostname.startsWith("10.") || targetUrl.hostname.startsWith("192.168.") || targetUrl.hostname.endsWith(".local")) {
    return new Response(JSON.stringify({ error: "Blocked private target" }), { status: 403, headers: { "content-type": "application/json" } });
  }
  const headers = new Headers(req.headers);
  headers.delete("x-relay-target"); headers.delete("x-relay-path"); headers.delete("x-relay-auth"); headers.delete("host");
  const response = await fetch(targetUrl.href, { method: req.method, headers, body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined, duplex: "half" });
  return new Response(response.body, { status: response.status, headers: response.headers });
});`.trim();
  }

  if (relayType === "cloudflare") {
    return `
export default {
  async fetch(request, env, ctx) {
    const auth = request.headers.get("x-relay-auth");
    const expected = env.RELAY_AUTH;
    if (expected && auth !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
    }
    const target = request.headers.get("x-relay-target");
    const relayPath = request.headers.get("x-relay-path") || "/";
    if (!target) {
      return new Response(JSON.stringify({ error: "Missing x-relay-target header" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    const targetUrl = new URL(target.replace(/\\/$/, "") + relayPath);
    if (["127.0.0.1","localhost","::1","0.0.0.0"].includes(targetUrl.hostname) || targetUrl.hostname.startsWith("10.") || targetUrl.hostname.startsWith("192.168.") || targetUrl.hostname.endsWith(".local")) {
      return new Response(JSON.stringify({ error: "Blocked private target" }), { status: 403, headers: { "content-type": "application/json" } });
    }
    const headers = new Headers(request.headers);
    headers.delete("x-relay-target"); headers.delete("x-relay-path"); headers.delete("x-relay-auth"); headers.delete("host");
    const response = await fetch(targetUrl.href, { method: request.method, headers, body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined, duplex: "half" });
    return new Response(response.body, { status: response.status, headers: response.headers });
  }
};`.trim();
  }

  // Default: Vercel edge function
  return `
export const config = { runtime: "edge" };

export default async function handler(req) {
  const auth = req.headers.get("x-relay-auth");
  const expected = process.env.RELAY_AUTH;
  if (expected && auth !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  const target = req.headers.get("x-relay-target");
  const relayPath = req.headers.get("x-relay-path") || "/";
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing x-relay-target header" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const targetUrl = new URL(target.replace(/\\/$/, "") + relayPath);
  if (["127.0.0.1","localhost","::1","0.0.0.0"].includes(targetUrl.hostname) || targetUrl.hostname.startsWith("10.") || targetUrl.hostname.startsWith("192.168.") || targetUrl.hostname.endsWith(".local")) {
    return new Response(JSON.stringify({ error: "Blocked private target" }), { status: 403, headers: { "content-type": "application/json" } });
  }
  const headers = new Headers(req.headers);
  headers.delete("x-relay-target"); headers.delete("x-relay-path"); headers.delete("x-relay-auth"); headers.delete("host");
  const response = await fetch(targetUrl.href, { method: req.method, headers, body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined, duplex: "half" });
  return new Response(response.body, { status: response.status, headers: response.headers });
}`.trim();
}

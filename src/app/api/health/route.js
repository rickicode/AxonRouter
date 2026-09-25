import { NextResponse } from "@/lib/http/response.js";
import { pingDb } from "@/lib/db/repos/settingsRepo.js";
import { memSize } from "@/lib/cache/memoryStore";
import { isValkeyAvailable, valkeyPingLatencyMs } from "@/lib/cache/valkeyClient.js";
import { getRoutingMetrics } from "open-sse/services/routingMetrics";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET() {
  const check = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    postgres: false,
    // Overwritten below once Valkey reachability is known.
    cache: true,
    cacheNote: "memory-only speed layer",
    latencyMs: {},
  };

  // Check PostgreSQL
  const dbStart = Date.now();
  try {
    const ok = await pingDb();
    check.postgres = ok;
    check.latencyMs.postgres = Date.now() - dbStart;
  } catch (err) {
    check.postgres = false;
    check.postgresError = err.message;
    check.status = "degraded";
  }

  // Memory speed-layer stats
  try {
    check.latencyMs.memory = 0;
    check.memoryKeys = memSize();
  } catch {}

  // Valkey is the cross-process coordination layer. It is optional by design:
  // when it is down the app fails open to per-process memory, so an unhealthy
  // Valkey must NOT flip the top-level status or the 503 — otherwise watchtower
  // and the compose healthcheck would restart a perfectly serving container.
  try {
    const valkeyUp = isValkeyAvailable();
    check.valkey = valkeyUp;
    check.cacheNote = valkeyUp
      ? "valkey shared speed layer"
      : "memory-only speed layer (valkey unavailable)";
    if (valkeyUp) {
      const rtt = await valkeyPingLatencyMs();
      check.valkey = rtt >= 0;
      if (rtt >= 0) check.latencyMs.valkey = rtt;
      else check.cacheNote = "memory-only speed layer (valkey unreachable)";
    }
  } catch {
    check.valkey = false;
  }

  check.routing = getRoutingMetrics();

  const httpStatus = check.postgres ? 200 : 503;
  return NextResponse.json(check, { status: httpStatus, headers: CORS_HEADERS });
}

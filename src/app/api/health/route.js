import { NextResponse } from "@/lib/http/response.js";
import { pingDb } from "@/lib/db/repos/settingsRepo.js";
import { memSize } from "@/lib/cache/memoryStore";
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
    // Single-container: in-memory speed layer is always up.
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

  check.routing = getRoutingMetrics();

  const httpStatus = check.postgres ? 200 : 503;
  return NextResponse.json(check, { status: httpStatus, headers: CORS_HEADERS });
}

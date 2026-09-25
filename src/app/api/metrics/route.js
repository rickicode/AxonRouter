import { renderPrometheusMetrics } from "@/lib/observability/prometheusMetrics.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET() {
  const body = await renderPrometheusMetrics();
  return new Response(body, {
    status: 200,
    headers: CORS_HEADERS,
  });
}

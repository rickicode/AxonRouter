import { NextResponse } from "next/server";

export async function GET(request) {
  const origin = new URL(request.url).origin;
  const res = await fetch(`${origin}/api/mcp/status`, { cache: "no-store" });
  const status = await res.json().catch(() => ({}));
  return NextResponse.json({
    protocol: "mcp",
    status: status?.status || "offline",
    version: 1,
    capabilities: ["tool-schema", "tool-invocation-mapping", "audit", "runtime-status"],
  }, { headers: { "Cache-Control": "no-store" } });
}

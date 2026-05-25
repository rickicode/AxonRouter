import { NextResponse } from "next/server";

export async function GET(request) {
  const origin = new URL(request.url).origin;
  const res = await fetch(`${origin}/api/mcp/tools`, { cache: "no-store" });
  const payload = await res.json();
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

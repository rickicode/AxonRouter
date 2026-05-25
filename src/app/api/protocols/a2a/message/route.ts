import { NextResponse } from "next/server";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    protocol: "a2a",
    status: "ack",
    received: {
      agent: body?.agent || null,
      message: body?.message || null,
      correlationId: body?.correlationId || null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

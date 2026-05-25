import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    protocol: "a2a",
    status: "ok",
    version: 1,
    capabilities: ["agent-message-envelope", "streaming-handshake"],
  }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";

export async function POST() {
  try {
    const { disableTunnelRuntime } = await import("@/lib/tunnel/tunnelConnectionRuntime");
    const result = await disableTunnelRuntime();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tunnel disable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

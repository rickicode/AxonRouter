import { NextResponse } from "next/server";

export async function POST() {
  try {
    const { disableTunnelRuntime } = await import("@axonrouter/tunnel/tunnelConnectionRuntime");
    const result = await disableTunnelRuntime();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Tunnel disable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

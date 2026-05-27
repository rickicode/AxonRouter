import { NextResponse } from "next/server";

export async function POST() {
  try {
    const { disableTailscaleRuntime } = await import("@/lib/tunnel/tailscaleTunnelRuntime");
    const result = await disableTailscaleRuntime();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tailscale disable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

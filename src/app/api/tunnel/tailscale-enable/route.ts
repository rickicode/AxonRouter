import { NextResponse } from "next/server";

export async function POST() {
  try {
    const { enableTailscaleRuntime } = await import("@/lib/tunnel/tailscaleTunnelRuntime");
    const result = await enableTailscaleRuntime();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tailscale enable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

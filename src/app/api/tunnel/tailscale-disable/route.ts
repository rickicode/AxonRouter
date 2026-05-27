import { NextResponse } from "next/server";

function loadRuntimeModule() {
  return import("@/lib/tunnel/tailscaleTunnelRuntime");
}

export async function POST() {
  try {
    const { disableTailscaleRuntime } = await loadRuntimeModule();
    const result = await disableTailscaleRuntime();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tailscale disable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

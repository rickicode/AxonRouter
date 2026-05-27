import { NextResponse } from "next/server";

function loadRuntimeModule() {
  return import(/*turbopackIgnore: true*/ "@/lib/tunnel/tailscaleTunnelRuntime");
}

export async function POST() {
  try {
    const { enableTailscaleRuntime } = await loadRuntimeModule();
    const result = await enableTailscaleRuntime();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tailscale enable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

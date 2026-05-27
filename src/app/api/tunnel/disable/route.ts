import { NextResponse } from "next/server";

function loadRuntimeModule() {
  return import(/*turbopackIgnore: true*/ "@/lib/tunnel/tunnelConnectionRuntime");
}

export async function POST() {
  try {
    const { disableTunnelRuntime } = await loadRuntimeModule();
    const result = await disableTunnelRuntime();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tunnel disable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

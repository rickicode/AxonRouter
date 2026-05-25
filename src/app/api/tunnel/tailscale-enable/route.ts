import { NextResponse } from "next/server";

function loadRuntimeModule() {
  // Intentionally defer module resolution to runtime to reduce NFT static trace fan-out.
  const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<typeof import("@/lib/tunnel/tailscaleTunnelRuntime")>;
  return dynamicImport("@/lib/tunnel/tailscaleTunnelRuntime");
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

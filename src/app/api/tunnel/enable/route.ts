import { NextResponse } from "next/server";

const DNS_WARMUP_DELAY_MS = 8000;

function loadRuntimeModule() {
  // Intentionally defer module resolution to runtime to reduce NFT static trace fan-out.
  const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<typeof import("@/lib/tunnel/tunnelConnectionRuntime")>;
  return dynamicImport("@/lib/tunnel/tunnelConnectionRuntime");
}

export async function POST() {
  try {
    const { enableTunnelRuntime } = await loadRuntimeModule();
    const result = await enableTunnelRuntime();
    // Wait for DNS warmup to propagate at Cloudflare edge after tunnel registered.
    await new Promise((resolve) => setTimeout(resolve, DNS_WARMUP_DELAY_MS));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tunnel enable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

function loadRuntimeModule() {
  // Intentionally defer module resolution to runtime to reduce NFT static trace fan-out.
  const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<typeof import("@/lib/tunnel/tunnelConnectionRuntime")>;
  return dynamicImport("@/lib/tunnel/tunnelConnectionRuntime");
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

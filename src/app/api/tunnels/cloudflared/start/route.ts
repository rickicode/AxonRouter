import { NextResponse } from "next/server";

export async function POST() {
  try {
    const tunnelMod = ["@axonrouter", "tunnel"].join("/");
    const { startCloudflaredTunnel } = await import(tunnelMod);
    const status = await startCloudflaredTunnel();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to start cloudflared" }, { status: 500 });
  }
}

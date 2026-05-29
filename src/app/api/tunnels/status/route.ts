import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Use computed path to prevent Turbopack from statically tracing tunnel package
    const tunnelMod = ["@axonrouter", "tunnel"].join("/");
    const { getCloudflaredTunnelStatus, getTailscaleTunnelStatus, getNgrokTunnelStatus } = await import(tunnelMod);
    const [cloudflared, tailscale, ngrok] = await Promise.all([
      getCloudflaredTunnelStatus(),
      getTailscaleTunnelStatus(),
      getNgrokTunnelStatus(),
    ]);
    return NextResponse.json({ cloudflared, tailscale, ngrok });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to get tunnel status" }, { status: 500 });
  }
}

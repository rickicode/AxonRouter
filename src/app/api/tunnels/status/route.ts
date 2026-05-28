import { NextResponse } from "next/server";
import { getCloudflaredTunnelStatus, getTailscaleTunnelStatus, getNgrokTunnelStatus } from "@axonrouter/tunnel";

export async function GET() {
  try {
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

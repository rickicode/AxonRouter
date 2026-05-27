import { NextResponse } from "next/server";
import { getCloudflaredDownloadStatus, getTunnelStatusRuntime, getTailscaleStatusRuntime } from "@axonrouter/tunnel";

export async function GET() {
  try {
    const download = getCloudflaredDownloadStatus();
    const [tunnel, tailscale] = await Promise.all([getTunnelStatusRuntime(), getTailscaleStatusRuntime()]);
    return NextResponse.json({ tunnel, tailscale, download });
  } catch (error) {
    console.error("Tunnel status error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

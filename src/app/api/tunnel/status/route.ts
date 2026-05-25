import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [{ getCloudflaredDownloadStatus }, { getTunnelStateStatusRuntime }] = await Promise.all([
      import("@/lib/tunnel/cloudflaredDownloadState"),
      import("@/lib/tunnel/tunnelStateStatusRuntime"),
    ]);
    const download = getCloudflaredDownloadStatus();
    const { getTunnelStatus, getTailscaleStatus } = await getTunnelStateStatusRuntime();
    const [tunnel, tailscale] = await Promise.all([getTunnelStatus(), getTailscaleStatus()]);
    return NextResponse.json({ tunnel, tailscale, download });
  } catch (error) {
    console.error("Tunnel status error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

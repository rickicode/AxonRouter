import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [{ getCloudflaredDownloadStatus }, { getTunnelStatusPayload }] = await Promise.all([
      import("@axonrouter/tunnel/cloudflaredDownloadState"),
      import("@axonrouter/tunnel/tunnelStatus"),
    ]);
    const download = getCloudflaredDownloadStatus();
    const result = await getTunnelStatusPayload(download);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tunnel status error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

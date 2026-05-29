import { NextResponse } from "next/server";
import { startCloudflaredTunnel } from "@axonrouter/tunnel";

export async function POST() {
  try {
    const status = await startCloudflaredTunnel();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to start cloudflared" }, { status: 500 });
  }
}

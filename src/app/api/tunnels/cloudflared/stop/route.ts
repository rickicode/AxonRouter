import { NextResponse } from "next/server";
import { stopCloudflaredTunnel } from "@axonrouter/tunnel";

export async function POST() {
  try {
    const status = await stopCloudflaredTunnel();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to stop cloudflared" }, { status: 500 });
  }
}

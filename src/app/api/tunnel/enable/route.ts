import { NextResponse } from "next/server";
import { enableTunnelRuntime } from "@axonrouter/tunnel";

const DNS_WARMUP_DELAY_MS = 8000;

export async function POST() {
  try {
    const result = await enableTunnelRuntime();
    // Wait for DNS warmup to propagate at Cloudflare edge after tunnel registered.
    await new Promise((resolve) => setTimeout(resolve, DNS_WARMUP_DELAY_MS));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tunnel enable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

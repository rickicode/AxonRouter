import { NextResponse } from "next/server";
import { enableTailscaleTunnel } from "@axonrouter/tunnel";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await enableTailscaleTunnel(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to start tailscale" }, { status: 500 });
  }
}

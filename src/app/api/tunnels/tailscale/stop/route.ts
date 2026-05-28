import { NextResponse } from "next/server";
import { disableTailscaleTunnel } from "@axonrouter/tunnel";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await disableTailscaleTunnel(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to stop tailscale" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const tunnelMod = ["@axonrouter", "tunnel"].join("/");
    const { disableTailscaleTunnel } = await import(tunnelMod);
    const body = await request.json().catch(() => ({}));
    const result = await disableTailscaleTunnel(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to stop tailscale" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

export async function POST() {
  try {
    const tunnelMod = ["@axonrouter", "tunnel"].join("/");
    const { stopNgrokTunnel } = await import(tunnelMod);
    const status = await stopNgrokTunnel();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to stop ngrok" }, { status: 500 });
  }
}

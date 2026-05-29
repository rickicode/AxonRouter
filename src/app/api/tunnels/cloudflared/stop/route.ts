import { NextResponse } from "next/server";

export async function POST() {
  try {
    const tunnelMod = ["@axonrouter", "tunnel"].join("/");
    const { stopCloudflaredTunnel } = await import(tunnelMod);
    const status = await stopCloudflaredTunnel();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to stop cloudflared" }, { status: 500 });
  }
}

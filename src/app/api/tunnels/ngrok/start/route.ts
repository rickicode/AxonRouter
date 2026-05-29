import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const tunnelMod = ["@axonrouter", "tunnel"].join("/");
    const { startNgrokTunnel } = await import(tunnelMod);
    const body = await request.json().catch(() => ({}));
    const status = await startNgrokTunnel(body?.authToken);
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to start ngrok" }, { status: 500 });
  }
}

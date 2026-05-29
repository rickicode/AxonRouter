import { NextResponse } from "next/server";
import { startNgrokTunnel } from "@axonrouter/tunnel";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const status = await startNgrokTunnel(body?.authToken);
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to start ngrok" }, { status: 500 });
  }
}

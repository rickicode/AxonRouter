import { NextResponse } from "next/server";
import { stopNgrokTunnel } from "@axonrouter/tunnel";

export async function POST() {
  try {
    const status = await stopNgrokTunnel();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to stop ngrok" }, { status: 500 });
  }
}

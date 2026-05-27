import { NextResponse } from "next/server";
import { startTailscaleDaemonFromStoredPassword } from "@axonrouter/tunnel/tailscaleDaemonStart";

export async function POST(request: Request) {
  try {
    const body: any = await request.json().catch(() => ({}));
    await startTailscaleDaemonFromStoredPassword(body.sudoPassword);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Tailscale start daemon error:", error);
    return NextResponse.json({ error: error?.message || "Failed to start Tailscale daemon" }, { status: 500 });
  }
}

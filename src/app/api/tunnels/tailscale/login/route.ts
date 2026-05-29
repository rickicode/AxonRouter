import { NextResponse } from "next/server";
import { startTailscaleLogin } from "@axonrouter/tunnel";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await startTailscaleLogin(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to start tailscale login" }, { status: 500 });
  }
}

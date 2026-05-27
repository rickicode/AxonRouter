import { NextResponse } from "next/server";
import { startTailscaleLoginFlow } from "@axonrouter/tunnel/tailscaleLoginAccess";

export async function POST() {
  try {
    const result = await startTailscaleLoginFlow();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Tailscale login error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

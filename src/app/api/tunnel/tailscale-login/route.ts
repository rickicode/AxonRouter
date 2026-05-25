import { NextResponse } from "next/server";
import { startTailscaleLoginFlow } from "@/lib/tunnel/tailscaleLoginAccess";

export async function POST() {
  try {
    const result = await startTailscaleLoginFlow();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tailscale login error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

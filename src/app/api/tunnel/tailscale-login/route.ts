import { NextResponse } from "next/server";
import { loadPersistedShortId, generateShortId, startTailscaleLogin } from "@axonrouter/tunnel";

export async function POST() {
  try {
    const shortId = loadPersistedShortId() || generateShortId();
    const result = await startTailscaleLogin(shortId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tailscale login error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

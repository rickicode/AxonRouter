import { NextResponse } from "next/server";
import { enableTailscaleRuntime } from "@axonrouter/tunnel";

export async function POST() {
  try {
    const result = await enableTailscaleRuntime();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tailscale enable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { disableTailscaleRuntime } from "@axonrouter/tunnel";

export async function POST() {
  try {
    const result = await disableTailscaleRuntime();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tailscale disable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

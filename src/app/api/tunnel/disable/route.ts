import { NextResponse } from "next/server";
import { disableTunnelRuntime } from "@axonrouter/tunnel";

export async function POST() {
  try {
    const result = await disableTunnelRuntime();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tunnel disable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

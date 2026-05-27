import { NextResponse } from "next/server";
import { getTailscaleCheckPayload } from "@axonrouter/tunnel/tailscaleCheckAccess";

export async function GET() {
  try {
    return NextResponse.json(getTailscaleCheckPayload());
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

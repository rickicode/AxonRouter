import { NextResponse } from "next/server";

export async function GET() {
	try {
		const { getNgrokTunnelStatus } = await import("@axonrouter/tunnel");
		const ngrok = await getNgrokTunnelStatus();
		return NextResponse.json({ ngrok });
	} catch (error: any) {
		return NextResponse.json(
			{ error: error?.message || "Failed to get tunnel status" },
			{ status: 500 },
		);
	}
}

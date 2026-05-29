import { NextResponse } from "next/server";

export async function GET() {
	try {
		const {
			getCloudflaredTunnelStatus,
			getTailscaleTunnelStatus,
			getNgrokTunnelStatus,
		} = await import("@axonrouter/tunnel");
		const [cloudflared, tailscale, ngrok] = await Promise.all([
			getCloudflaredTunnelStatus(),
			getTailscaleTunnelStatus(),
			getNgrokTunnelStatus(),
		]);
		return NextResponse.json({ cloudflared, tailscale, ngrok });
	} catch (error: any) {
		return NextResponse.json(
			{ error: error?.message || "Failed to get tunnel status" },
			{ status: 500 },
		);
	}
}

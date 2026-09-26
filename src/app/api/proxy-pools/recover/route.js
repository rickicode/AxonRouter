import { NextResponse } from "@/lib/http/response.js";
import { autoRecoverUnhealthyProxyPools } from "@/lib/network/proxyAutoRecovery.js";

// POST /api/proxy-pools/recover - Probe and auto-recover unhealthy/degraded proxy pools
export async function POST(request) {
  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";
    const minCooldownMs = force ? 0 : undefined;

    const result = await autoRecoverUnhealthyProxyPools({ minCooldownMs });
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error in autoRecoverUnhealthyProxyPools endpoint:", error);
    return NextResponse.json(
      { error: "Failed to run proxy auto-recovery" },
      { status: 500 }
    );
  }
}

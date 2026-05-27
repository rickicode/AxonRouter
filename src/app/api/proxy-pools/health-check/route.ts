import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { runHealthCheckNow, getLastHealthCheckAt } from "@/lib/network/proxyHealthCheck";

// GET /api/proxy-pools/health-check - Get last health check status
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  return NextResponse.json({
    ok: true,
    lastHealthCheckAt: getLastHealthCheckAt(),
  });
}

// POST /api/proxy-pools/health-check - Trigger immediate health check
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { checkedAt, results } = await runHealthCheckNow();
    return NextResponse.json({ ok: true, checkedAt, results });
  } catch (error) {
    console.log("Error running health check:", error);
    return NextResponse.json({ error: "Failed to run health check" }, { status: 500 });
  }
}

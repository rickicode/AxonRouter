import { NextResponse } from "@/lib/http/response.js";
import { getUsageStats, getActiveRequests } from "@/lib/usageDb";

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d", "all"]);

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const [stats, live] = await Promise.all([
      getUsageStats(period),
      getActiveRequests().catch(() => ({ activeRequests: [], recentRequests: [] })),
    ]);

    return NextResponse.json({
      ...stats,
      activeRequests: live.activeRequests || [],
      recentRequests: live.recentRequests || [],
      errorProvider: live.errorProvider || null,
    });
  } catch (error) {
    console.error("[API] Failed to get usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}

import { NextResponse } from "@/lib/http/response.js";
import { getComboAnalytics } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

// Window presets mirror the usage analytics periods (local time).
function resolveWindow(period) {
  const now = new Date();
  const to = now.toISOString();
  const map = {
    today: () => {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    },
    "24h": () => new Date(now.getTime() - 24 * 3600 * 1000),
    "7d": () => new Date(now.getTime() - 7 * 24 * 3600 * 1000),
    "30d": () => new Date(now.getTime() - 30 * 24 * 3600 * 1000),
  };
  const from = (map[period] || map.today)();
  return { timeFrom: from.toISOString(), timeTo: to };
}

/**
 * GET /api/combos/analytics?period=today|24h|7d|30d
 * Aggregates per-combo and per-member (provider/model) performance from
 * request_details rows tagged with comboName.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "today";
    const { timeFrom, timeTo } = resolveWindow(period);
    const result = await getComboAnalytics({ timeFrom, timeTo });
    return NextResponse.json({ period, ...result });
  } catch (error) {
    console.error("[API] /api/combos/analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch combo analytics", details: error.message },
      { status: 500 },
    );
  }
}

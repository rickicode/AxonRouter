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

    const include = new Set(
      (searchParams.get("include") || "").split(",").map((s) => s.trim()).filter(Boolean)
    );

    const [stats, live] = await Promise.all([
      getUsageStats(period),
      getActiveRequests().catch(() => ({ activeRequests: [], recentRequests: [] })),
    ]);

    const payload = {
      ...stats,
      activeRequests: live.activeRequests || [],
      recentRequests: live.recentRequests || [],
      errorProvider: live.errorProvider || null,
    };

    // byAccount is 352KB of this 431KB response (82%) and exactly one table reads
    // it — the Accounts tab of UsageStats. The App page hits this same endpoint
    // and never touches it, and UsageStats refetches on the 60s bucket poll, so
    // excluding it by default saves every consumer ~350KB of JSON.parse per
    // refresh. The Accounts tab asks for it with `?include=byAccount` on first
    // open. `pending.byAccount` (the live markers, 32 bytes) rides along either
    // way, so the tab is still usable while the fetch is in flight.
    if (!include.has("byAccount")) delete payload.byAccount;

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[API] Failed to get usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}

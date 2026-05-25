import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getUsageAnalytics } from "@/lib/usage/usageAnalytics";

const VALID_PERIODS = new Set(["24h", "7d", "30d", "60d", "all", "custom"]);

type UsageAnalyticsPeriod = "24h" | "7d" | "30d" | "60d" | "all" | "custom";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || "30d") as UsageAnalyticsPeriod;

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const analytics = await getUsageAnalytics({
      period,
      provider: searchParams.get("provider") || undefined,
      apiKey: searchParams.get("apiKey") || undefined,
      account: searchParams.get("account") || undefined,
      model: searchParams.get("model") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("[API] Failed to get usage analytics:", error);
    return NextResponse.json({ error: "Failed to fetch usage analytics" }, { status: 500 });
  }
}

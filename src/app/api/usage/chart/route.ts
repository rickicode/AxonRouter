import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getChartData } from "@/lib/usageDb";

const VALID_PERIODS = new Set(["24h", "7d", "30d", "60d"] as const);

type ValidPeriod = "24h" | "7d" | "30d" | "60d";

function isValidPeriod(period: string): period is ValidPeriod {
  return VALID_PERIODS.has(period as ValidPeriod);
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";

    if (!isValidPeriod(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const data = await getChartData(period);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API] Failed to get chart data:", error);
    return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 });
  }
}

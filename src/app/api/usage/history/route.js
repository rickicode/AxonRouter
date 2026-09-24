import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usageDb";

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const period = searchParams.get("period") || "7d";
    const stats = await getUsageStats(period);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}

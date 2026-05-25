import { NextResponse } from "next/server";
import { getPluginUsageSummary, getUsageDb } from "@/lib/usageDb";

const VALID_PERIODS = new Set(["today", "last24h", "7d"]);

function normalizeUsageData(data: any = {}) {
  return {
    history: Array.isArray(data.history) ? data.history : [],
    dailySummary: data.dailySummary && !Array.isArray(data.dailySummary)
      ? data.dailySummary
      : {},
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "today";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ ok: false, error: "Invalid period" }, { status: 400 });
    }

    const usageDb = await getUsageDb();
    const data = normalizeUsageData((usageDb as any)?.data);
    const now = new Date();
    const summary = getPluginUsageSummary({ period, ...data, now });

    return NextResponse.json({
      ok: true,
      period,
      generatedAt: now.toISOString(),
      summary,
    });
  } catch (error) {
    console.error("[API] Failed to fetch plugin usage summary:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch plugin usage summary" },
      { status: 500 },
    );
  }
}

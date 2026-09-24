import { NextResponse } from "next/server";
import { getAnalyticsSummary } from "@/lib/db/repos/analyticsRepo";
import { validateAnalyticsFilters } from "@/lib/analyticsFilters";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawFilters = {};
    for (const key of [
      "timeFrom",
      "timeTo",
      "provider",
      "model",
      "timeBucket",
      "errorCategory",
    ]) {
      const val = searchParams.get(key);
      if (val !== null && val !== "") {
        rawFilters[key] = val;
      }
    }

    let filters;
    try {
      filters = validateAnalyticsFilters(rawFilters);
    } catch (valErr) {
      return NextResponse.json({ error: valErr.message }, { status: 400 });
    }

    const summary = await getAnalyticsSummary(filters);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[API] Failed to get analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}
